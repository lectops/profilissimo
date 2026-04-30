export const INSTALL_COMMAND = `curl -fsSL https://raw.githubusercontent.com/lectops/profilissimo/main/installer/install.sh | bash`;

export const UNINSTALL_COMMAND = `rm -rf ~/.profilissimo && rm "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.profilissimo.nmh.json"`;

export const CWS_LISTING_URL = "https://chromewebstore.google.com/detail/profilissimo/olhphbhieleagngagocedaildgefdmni";

// Minimum NMH version required for non-http(s) URL transfer and the
// `open_profile` action. The connected NMH's version is read from
// `health_check`; older NMHs degrade to the previous "URL must be http/https"
// behavior, with a Settings page nudge to update.
export const REQUIRED_NMH_VERSION = "1.1.0";
