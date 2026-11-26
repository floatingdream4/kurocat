//! Lightweight "immersive media" detector for the BigFish companion (3D glasses + snacks mode).
//!
//! Reports `active = true` while the foreground window is a true fullscreen window (its rectangle
//! matches its monitor exactly) that belongs to a browser, a video player or a slideshow app.
//! Read-only foreground window/executable metadata query ONLY, same as `game_detect`.
//! Emits `kuro-media-active` to the frontend; ~2s poll interval, ~4s enter/leave hysteresis.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaActivePayload {
    pub active: bool,
}

/// Browsers, video players and presentation apps whose fullscreen windows count as "watching".
#[allow(dead_code)]
const MEDIA_EXES: &[&str] = &[
    // Browsers
    "chrome.exe",
    "msedge.exe",
    "firefox.exe",
    "brave.exe",
    "opera.exe",
    "vivaldi.exe",
    "arc.exe",
    "360chrome.exe",
    "360chromex.exe",
    "qqbrowser.exe",
    "sogouexplorer.exe",
    "quark.exe",
    // Video players & streaming clients
    "vlc.exe",
    "potplayermini64.exe",
    "potplayermini.exe",
    "mpv.exe",
    "mpc-hc64.exe",
    "mpc-be64.exe",
    "wmplayer.exe",
    "video.ui.exe",
    "microsoft.media.player.exe",
    "bilibili.exe",
    "douyin.exe",
    "qiyi.exe",
    "iqiyi.exe",
    "youkumedia.exe",
    "qqlive.exe",
    // Slideshows
    "powerpnt.exe",
    "wpp.exe",
    "wps.exe",
];

/// True when the executable path belongs to a known browser / video player / slideshow app.
#[allow(dead_code)]
pub fn is_media_exe(exe_path: &str) -> bool {
    let path_lower = exe_path.trim().replace('/', "\\").to_ascii_lowercase();
    let exe_name = path_lower.rsplit('\\').next().unwrap_or("");
    !exe_name.is_empty() && MEDIA_EXES.contains(&exe_name)
}

pub fn start_media_detection_watcher(app: AppHandle, paused_guard: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        let mut active = false;
        let mut on_streak: u8 = 0;
        let mut off_streak: u8 = 0;
        // Two consecutive ticks (~4s) are required both to enter and to leave, so a quick
        // Alt-Tab or a momentary fullscreen flash never flickers the 3D glasses on and off.
        const STREAK_TICKS: u8 = 2;

        loop {
            std::thread::sleep(Duration::from_millis(2000));

            let enabled = !paused_guard.load(Ordering::Relaxed);

            #[cfg(windows)]
            let detected = enabled && win_impl::foreground_is_fullscreen_media();
            #[cfg(not(windows))]
            let detected = false;

            if detected {
                off_streak = 0;
                on_streak = on_streak.saturating_add(1);
                if !active && on_streak >= STREAK_TICKS {
                    active = true;
                    let _ = app.emit("kuro-media-active", MediaActivePayload { active: true });
                }
            } else {
                on_streak = 0;
                if active {
                    off_streak = off_streak.saturating_add(1);
                    if off_streak >= STREAK_TICKS || !enabled {
                        active = false;
                        off_streak = 0;
                        let _ =
                            app.emit("kuro-media-active", MediaActivePayload { active: false });
                    }
                }
            }
        }
    });
}

#[cfg(windows)]
mod win_impl {
    use super::is_media_exe;
    use windows_sys::Win32::Foundation::{CloseHandle, RECT};
    use windows_sys::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId,
    };

    /// A maximized window overshoots its monitor by the resize border (~8px) and stops at the
    /// taskbar, while a real fullscreen window (F11, video fullscreen, slideshow) matches the
    /// monitor rectangle exactly. Requiring an exact match keeps ordinary maximized browsing out.
    const EDGE_TOLERANCE_PX: i32 = 2;

    pub fn foreground_is_fullscreen_media() -> bool {
        unsafe {
            let fg = GetForegroundWindow();
            if fg.is_null() {
                return false;
            }

            let mut wr: RECT = std::mem::zeroed();
            if GetWindowRect(fg, &mut wr) == 0 {
                return false;
            }

            let monitor = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
            if (monitor as usize) == 0 {
                return false;
            }
            let mut mi: MONITORINFO = std::mem::zeroed();
            mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
            if GetMonitorInfoW(monitor, &mut mi) == 0 {
                return false;
            }
            let m = mi.rcMonitor;
            if (wr.left - m.left).abs() > EDGE_TOLERANCE_PX
                || (wr.top - m.top).abs() > EDGE_TOLERANCE_PX
                || (wr.right - m.right).abs() > EDGE_TOLERANCE_PX
                || (wr.bottom - m.bottom).abs() > EDGE_TOLERANCE_PX
            {
                return false;
            }

            let mut pid: u32 = 0;
            GetWindowThreadProcessId(fg, &mut pid);
            if pid == 0 {
                return false;
            }
            let hproc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if hproc.is_null() {
                return false;
            }
            let mut path_buf = [0u16; 512];
            let mut path_len: u32 = path_buf.len() as u32;
            let ok = QueryFullProcessImageNameW(hproc, 0, path_buf.as_mut_ptr(), &mut path_len);
            CloseHandle(hproc);
            if ok == 0 || path_len == 0 {
                return false;
            }
            let exe_path = String::from_utf16_lossy(&path_buf[..path_len as usize]);
            is_media_exe(&exe_path)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::is_media_exe;

    #[test]
    fn recognizes_browsers_players_and_slideshows() {
        assert!(is_media_exe(r"C:\Program Files\Google\Chrome\Application\chrome.exe"));
        assert!(is_media_exe(r"C:\Program Files\VideoLAN\VLC\vlc.exe"));
        assert!(is_media_exe(r"C:\Program Files\Microsoft Office\root\Office16\POWERPNT.EXE"));
    }

    #[test]
    fn rejects_other_apps() {
        assert!(!is_media_exe(r"C:\Windows\explorer.exe"));
        assert!(!is_media_exe(r"C:\Program Files\Microsoft VS Code\Code.exe"));
        assert!(!is_media_exe(""));
    }
}
