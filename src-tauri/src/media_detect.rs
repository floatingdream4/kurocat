//! Lightweight "immersive media" detector for the BigFish companion (3D glasses + snacks mode).
//!
//! Reports `active = true` while the foreground window is a true fullscreen window (its rectangle
//! matches its monitor exactly) that belongs to a browser, a video player or a slideshow app.
//! Read-only foreground window/executable metadata query ONLY, same as `game_detect`.
//! Emits `kuro-media-active` to the frontend; 1s poll interval, enters on the first positive tick
//! and leaves after ~4s of consecutive negative ticks.

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
        let mut off_streak: u8 = 0;
        // Entering is immediate (first positive tick, <=1s). Leaving needs ~4s of consecutive
        // negative ticks, so a quick Alt-Tab never flickers the 3D glasses off and back on.
        const LEAVE_TICKS: u8 = 4;
        #[cfg(windows)]
        let mut probe = win_impl::MediaProbe::default();

        loop {
            std::thread::sleep(Duration::from_millis(1000));

            let enabled = !paused_guard.load(Ordering::Relaxed);

            #[cfg(windows)]
            let detected = enabled && win_impl::foreground_is_fullscreen_media(&mut probe);
            #[cfg(not(windows))]
            let detected = false;

            if detected {
                off_streak = 0;
                if !active {
                    active = true;
                    let _ = app.emit("kuro-media-active", MediaActivePayload { active: true });
                }
            } else {
                if active {
                    off_streak = off_streak.saturating_add(1);
                    if off_streak >= LEAVE_TICKS || !enabled {
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
    use windows_sys::Win32::Foundation::{CloseHandle, HWND, RECT};
    use windows_sys::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows_sys::Win32::System::Threading::{
        GetCurrentProcessId, OpenProcess, QueryFullProcessImageNameW,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId, IsWindow,
    };

    /// Remembers the last fullscreen media window, so clicking the pet itself (which makes
    /// KuroCat the foreground window) does not end the movie mode while that window is still
    /// fullscreen behind her.
    #[derive(Default)]
    pub struct MediaProbe {
        last_media_hwnd: isize,
    }

    /// A maximized window overshoots its monitor by the resize border (~8px) and stops at the
    /// taskbar, while a real fullscreen window (F11, video fullscreen, slideshow) matches the
    /// monitor rectangle exactly. Requiring an exact match keeps ordinary maximized browsing out.
    const EDGE_TOLERANCE_PX: i32 = 2;

    pub fn foreground_is_fullscreen_media(probe: &mut MediaProbe) -> bool {
        unsafe {
            let fg = GetForegroundWindow();
            if fg.is_null() {
                return false;
            }

            let mut fg_pid: u32 = 0;
            GetWindowThreadProcessId(fg, &mut fg_pid);
            if fg_pid != 0 && fg_pid == GetCurrentProcessId() {
                // The pet (or its menu) took focus: judge by the remembered media window instead.
                let remembered = probe.last_media_hwnd as HWND;
                return probe.last_media_hwnd != 0
                    && IsWindow(remembered) != 0
                    && window_is_fullscreen_media(remembered);
            }

            let is_media = window_is_fullscreen_media(fg);
            probe.last_media_hwnd = if is_media { fg as isize } else { 0 };
            is_media
        }
    }

    fn window_is_fullscreen_media(fg: HWND) -> bool {
        unsafe {
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
