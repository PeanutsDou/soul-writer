use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{BufRead, BufReader, Write};
use std::os::windows::process::CommandExt;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Serialize)]
struct Request {
    id: u64,
    method: String,
    params: Value,
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct Response {
    id: u64,
    ok: bool,
    #[serde(default)]
    data: Value,
    #[serde(default)]
    error: String,
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum StreamLine {
    #[serde(rename = "stream_start")]
    Start,
    #[serde(rename = "stream_chunk")]
    #[serde(alias = "chunk")]
    Chunk { content: String },
    #[serde(rename = "thinking_chunk")]
    ThinkingChunk { content: String },
    #[serde(rename = "token_usage")]
    TokenUsage { tokens: u64 },
    #[serde(rename = "stream_error")]
    StreamError { error: String },
    #[serde(rename = "stream_end")]
    End,
    #[serde(rename = "tool_start")]
    ToolStart { id: String, name: String, args: Value },
    #[serde(rename = "tool_end")]
    ToolEnd { id: String, name: String, result: String },
    #[serde(rename = "done")]
    Done,
}

pub enum StreamEvent {
    Chunk(String),
    Thinking(String),
    TokenUsage(u64),
    ToolStart { id: String, name: String, args: Value },
    ToolEnd { id: String, name: String, result: String },
    Error(String),
    Done,
}

pub struct PythonBridge {
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
    stdout: Mutex<BufReader<ChildStdout>>,
}

impl PythonBridge {
    pub fn start(data_dir: &str) -> Result<Self, String> {
        let exe_dir = std::env::current_exe()
            .map_err(|e| format!("exe path: {e}"))?
            .parent()
            .ok_or("no exe parent")?
            .to_path_buf();

        let candidates = vec![
            std::env::current_dir().unwrap_or_default().join("../server"),
            std::env::current_dir().unwrap_or_default().join("server"),
            exe_dir.join("../../../server"),
            exe_dir.join("../../server"),
        ];

        let server_dir = candidates
            .iter()
            .find(|d| d.join("main.py").exists())
            .ok_or_else(|| format!("Cannot find server/main.py. Tried: {:?}", candidates))?;

        log::info!("Python server dir: {:?}", server_dir);

        let mut child = Command::new("python")
            .arg("main.py")
            .current_dir(server_dir)
            .env("SOUL_WRITER_DATA", data_dir)
            .env("PYTHONIOENCODING", "utf-8")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Failed to start Python: {e}"))?;

        let stdin = child.stdin.take().ok_or("No stdin")?;
        let stdout = child.stdout.take().ok_or("No stdout")?;
        let stderr = child.stderr.take().ok_or("No stderr")?;

        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(line) = line {
                    if !line.is_empty() {
                        log::error!("[Python] {}", line);
                    }
                }
            }
        });

        let mut reader = BufReader::new(stdout);

        let mut line = String::new();
        reader
            .read_line(&mut line)
            .map_err(|e| format!("Python read error: {e}"))?;

        if line.trim() != "READY" {
            return Err(format!("Unexpected Python startup: {line}"));
        }

        log::info!("Python backend ready");

        Ok(PythonBridge {
            child: Mutex::new(child),
            stdin: Mutex::new(stdin),
            stdout: Mutex::new(reader),
        })
    }

    /// Streaming call: writes request, reads stream lines + final response.
    pub fn call_streaming<F>(&self, method: &str, params: Value, mut on_event: F) -> Result<Value, String>
    where
        F: FnMut(StreamEvent),
    {
        let id = rand_id();
        let req = Request { id, method: method.to_string(), params };
        let json = serde_json::to_string(&req).map_err(|e| format!("JSON: {e}"))?;

        {
            let mut stdin = self.stdin.lock().map_err(|e| format!("Lock: {e}"))?;
            writeln!(stdin, "{}", json).map_err(|e| format!("Write: {e}"))?;
            stdin.flush().map_err(|e| format!("Flush: {e}"))?;
        }

        let mut stream_error: Option<String> = None;
        loop {
            let mut line = String::new();
            {
                let mut reader = self.stdout.lock().map_err(|e| format!("Lock: {e}"))?;
                let bytes = reader.read_line(&mut line).map_err(|e| format!("Read: {e}"))?;
                if bytes == 0 {
                    return Err("Python backend exited unexpectedly".to_string());
                }
            }

            let trimmed = line.trim();
            if trimmed.is_empty() { continue; }

            // Try stream line first
            if let Ok(sl) = serde_json::from_str::<StreamLine>(trimmed) {
                match sl {
                    StreamLine::Start => {}
                    StreamLine::Chunk { content } => on_event(StreamEvent::Chunk(content)),
                    StreamLine::ThinkingChunk { content } => on_event(StreamEvent::Thinking(content)),
                    StreamLine::TokenUsage { tokens } => on_event(StreamEvent::TokenUsage(tokens)),
                    StreamLine::ToolStart { id, name, args } => on_event(StreamEvent::ToolStart { id, name, args }),
                    StreamLine::ToolEnd { id, name, result } => on_event(StreamEvent::ToolEnd { id, name, result }),
                    StreamLine::StreamError { error } => {
                        on_event(StreamEvent::Error(error.clone()));
                        stream_error = Some(error);
                    }
                    StreamLine::Done => on_event(StreamEvent::Done),
                    StreamLine::End => {} // legacy, ignore
                }
                continue;
            }

            // Try final response
            if let Ok(resp) = serde_json::from_str::<Response>(trimmed) {
                if let Some(error) = stream_error {
                    return Err(error);
                }
                return if resp.ok { Ok(resp.data) } else { Err(resp.error) };
            }

            log::warn!("[Python] Unknown line: {}", trimmed);
        }
    }

    /// Normal call: one request → one response.
    pub fn call(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = rand_id();
        let req = Request { id, method: method.to_string(), params };
        let json = serde_json::to_string(&req).map_err(|e| format!("JSON: {e}"))?;

        {
            let mut stdin = self.stdin.lock().map_err(|e| format!("Lock: {e}"))?;
            writeln!(stdin, "{}", json).map_err(|e| format!("Write: {e}"))?;
            stdin.flush().map_err(|e| format!("Flush: {e}"))?;
        }

        let mut line = String::new();
        {
            let mut reader = self.stdout.lock().map_err(|e| format!("Lock: {e}"))?;
            let bytes = reader.read_line(&mut line).map_err(|e| format!("Read: {e}"))?;
            if bytes == 0 {
                return Err("Python backend exited unexpectedly".to_string());
            }
        }

        let resp: Response = serde_json::from_str(&line).map_err(|e| format!("Parse: {e} ({line})"))?;
        if resp.ok { Ok(resp.data) } else { Err(resp.error) }
    }
}

impl Drop for PythonBridge {
    fn drop(&mut self) {
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
        }
    }
}

fn rand_id() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_micros() as u64
}
