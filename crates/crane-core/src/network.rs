use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

use crate::types::CraneError;

/// Known hostnames that should be blocked to prevent SSRF.
const BLOCKED_HOSTNAMES: &[&str] = &[
    "localhost",
    "metadata.google.internal",
    "metadata.internal",
];

/// Check whether a URL host is a private, loopback, or otherwise
/// internal address that should not be accessed by a download manager.
///
/// Returns `true` if the host is safe (public), `false` if it appears
/// to be private/internal.
pub fn is_public_host(host: &str) -> bool {
    // Check against blocked hostnames (case-insensitive)
    let lower = host.to_ascii_lowercase();
    if BLOCKED_HOSTNAMES.iter().any(|&blocked| lower == blocked) {
        return false;
    }

    // Try to parse as an IP address
    if let Ok(ip) = host.parse::<IpAddr>() {
        return is_public_ip(ip);
    }

    // Try bracket-stripped IPv6 (e.g., "[::1]")
    let stripped = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = stripped.parse::<IpAddr>() {
        return is_public_ip(ip);
    }

    // For regular hostnames, we can't resolve DNS here (sync context),
    // so we allow them. The redirect policy will catch redirects to
    // private IPs.
    true
}

/// Check whether an IP address is public (not private/loopback/link-local).
fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_public_ipv4(v4),
        IpAddr::V6(v6) => is_public_ipv6(v6),
    }
}

fn is_public_ipv4(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    // 127.0.0.0/8 (loopback)
    if octets[0] == 127 {
        return false;
    }
    // 10.0.0.0/8 (private)
    if octets[0] == 10 {
        return false;
    }
    // 172.16.0.0/12 (private)
    if octets[0] == 172 && (16..=31).contains(&octets[1]) {
        return false;
    }
    // 192.168.0.0/16 (private)
    if octets[0] == 192 && octets[1] == 168 {
        return false;
    }
    // 169.254.0.0/16 (link-local, includes cloud metadata 169.254.169.254)
    if octets[0] == 169 && octets[1] == 254 {
        return false;
    }
    // 0.0.0.0/8 (unspecified)
    if octets[0] == 0 {
        return false;
    }
    true
}

fn is_public_ipv6(ip: Ipv6Addr) -> bool {
    // ::1 (loopback)
    if ip == Ipv6Addr::LOCALHOST {
        return false;
    }
    // :: (unspecified)
    if ip == Ipv6Addr::UNSPECIFIED {
        return false;
    }
    let segments = ip.segments();
    // fe80::/10 (link-local)
    if segments[0] & 0xFFC0 == 0xFE80 {
        return false;
    }
    // fc00::/7 (unique local)
    if segments[0] & 0xFE00 == 0xFC00 {
        return false;
    }
    // ::ffff:0:0/96 (IPv4-mapped) — check the embedded IPv4
    if segments[0..5] == [0, 0, 0, 0, 0] && segments[5] == 0xFFFF {
        let v4 = Ipv4Addr::new(
            (segments[6] >> 8) as u8,
            segments[6] as u8,
            (segments[7] >> 8) as u8,
            segments[7] as u8,
        );
        return is_public_ipv4(v4);
    }
    true
}

/// Validate that a URL is safe to fetch (public host, http/https scheme).
/// Returns `Ok(())` if safe, `Err` with a descriptive error otherwise.
pub fn validate_url_safe(url: &url::Url) -> Result<(), CraneError> {
    match url.scheme() {
        "http" | "https" => {}
        scheme => return Err(CraneError::UnsupportedScheme(scheme.to_string())),
    }

    if let Some(host) = url.host_str() {
        if !is_public_host(host) {
            return Err(CraneError::PrivateNetwork(host.to_string()));
        }
    }

    Ok(())
}

/// Build a reqwest redirect policy that blocks redirects to private/internal hosts.
pub fn safe_redirect_policy() -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(|attempt| {
        // Limit redirect depth
        if attempt.previous().len() > 10 {
            return attempt.error(std::io::Error::other("too many redirects"));
        }

        // Extract URL info before consuming `attempt`
        let scheme = attempt.url().scheme().to_string();
        let host = attempt.url().host_str().map(|h| h.to_string());

        // Validate scheme
        match scheme.as_str() {
            "http" | "https" => {}
            _ => {
                return attempt.error(std::io::Error::other(
                    format!("redirect to unsupported scheme: {scheme}"),
                ));
            }
        }

        // Validate host is not private
        if let Some(ref host) = host {
            if !is_public_host(host) {
                return attempt.error(std::io::Error::other(
                    format!("redirect to private/internal host blocked: {host}"),
                ));
            }
        }

        attempt.follow()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_public_ipv4() {
        assert!(is_public_host("8.8.8.8"));
        assert!(is_public_host("1.1.1.1"));
        assert!(is_public_host("93.184.216.34"));
    }

    #[test]
    fn test_private_ipv4_loopback() {
        assert!(!is_public_host("127.0.0.1"));
        assert!(!is_public_host("127.0.0.2"));
        assert!(!is_public_host("127.255.255.255"));
    }

    #[test]
    fn test_private_ipv4_rfc1918() {
        assert!(!is_public_host("10.0.0.1"));
        assert!(!is_public_host("10.255.255.255"));
        assert!(!is_public_host("172.16.0.1"));
        assert!(!is_public_host("172.31.255.255"));
        assert!(!is_public_host("192.168.0.1"));
        assert!(!is_public_host("192.168.255.255"));
    }

    #[test]
    fn test_private_ipv4_link_local() {
        assert!(!is_public_host("169.254.0.1"));
        assert!(!is_public_host("169.254.169.254")); // AWS metadata
    }

    #[test]
    fn test_private_ipv4_unspecified() {
        assert!(!is_public_host("0.0.0.0"));
    }

    #[test]
    fn test_private_ipv6() {
        assert!(!is_public_host("::1"));
        assert!(!is_public_host("::"));
        assert!(!is_public_host("fe80::1"));
        assert!(!is_public_host("fc00::1"));
        assert!(!is_public_host("fd00::1"));
    }

    #[test]
    fn test_public_ipv6() {
        assert!(is_public_host("2001:4860:4860::8888")); // Google DNS
    }

    #[test]
    fn test_blocked_hostnames() {
        assert!(!is_public_host("localhost"));
        assert!(!is_public_host("LOCALHOST"));
        assert!(!is_public_host("metadata.google.internal"));
    }

    #[test]
    fn test_regular_hostnames_allowed() {
        assert!(is_public_host("example.com"));
        assert!(is_public_host("cdn.example.com"));
        assert!(is_public_host("download.mozilla.org"));
    }

    #[test]
    fn test_ipv4_mapped_ipv6() {
        // ::ffff:127.0.0.1 is IPv4-mapped loopback
        assert!(!is_public_host("::ffff:127.0.0.1"));
        // ::ffff:8.8.8.8 is IPv4-mapped public
        assert!(is_public_host("::ffff:8.8.8.8"));
    }

    #[test]
    fn test_validate_url_safe() {
        let public = url::Url::parse("https://example.com/file.zip").unwrap();
        assert!(validate_url_safe(&public).is_ok());

        let private = url::Url::parse("http://127.0.0.1/secret").unwrap();
        assert!(validate_url_safe(&private).is_err());

        let ftp = url::Url::parse("ftp://example.com/file.txt").unwrap();
        assert!(validate_url_safe(&ftp).is_err());

        let metadata = url::Url::parse("http://169.254.169.254/latest/meta-data/").unwrap();
        assert!(validate_url_safe(&metadata).is_err());

        let localhost = url::Url::parse("http://localhost:8080/api").unwrap();
        assert!(validate_url_safe(&localhost).is_err());
    }
}
