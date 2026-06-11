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

/// Manages Python sidecar process and JSON-lines communication.
pub struct PythonBridge {
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
    stdout: Mutex<BufReader<ChildStdout>>,
}

impl PythonBridge {
    /// Spawn the Python sidecar and wait for READY signal.
    pub fn start(data_dir: &str) -> Result<Self, String> {
        // Resolve server directory: try CWD-relative first (dev mode),
        // then fall back to exe-relative (shortcut / bundled launch).
        let exe_dir = std::env::current_exe()
            .map_err(|e| format!("exe path: {e}"))?
            .parent()
            .ok_or("no exe parent")?
            .to_path_buf();

        let candidates = vec![
            std::env::current_dir().unwrap_or_default().join("../server"),  // from src-tauri/ (cargo tauri dev)
            std::env::current_dir().unwrap_or_default().join("server"),    // from project root
            exe_dir.join("../../../server"),  // from target/debug/ (direct exe launch)
            exe_dir.join("../../server"),     // from target/release/
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

        // Spawn a thread to log Python stderr
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

        // Read startup READY signal
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

    /// Call a method on the Python backend. Blocks until response.
    pub fn call(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = rand_id();

        let req = Request {
            id,
            method: method.to_string(),
            params,
        };
        let json = serde_json::to_string(&req).map_err(|e| format!("JSON: {e}"))?;

        // Write request to stdin
        {
            let mut stdin = self.stdin.lock().map_err(|e| format!("Lock: {e}"))?;
            writeln!(stdin, "{}", json).map_err(|e| format!("Write: {e}"))?;
            stdin.flush().map_err(|e| format!("Flush: {e}"))?;
        }

        // Read response from stdout
        let mut line = String::new();
        {
            let mut reader = self.stdout.lock().map_err(|e| format!("Lock: {e}"))?;
            reader
                .read_line(&mut line)
                .map_err(|e| format!("Read response: {e}"))?;
        }

        let resp: Response =
            serde_json::from_str(&line).map_err(|e| format!("Parse response: {e} ({line})"))?;

        if resp.ok {
            Ok(resp.data)
        } else {
            Err(resp.error)
        }
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
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_micros() as u64
}
