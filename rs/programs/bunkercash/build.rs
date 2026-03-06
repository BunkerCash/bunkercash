/// Build script for the bunkercash Anchor program.
///
/// Reads `programs/bunkercash/.env` at compile time and writes a generated
/// `squads_keys.rs` with `pub const SQUADS_*: Pubkey = pubkey!("...");` so
/// the program can use compile-time Pubkey constants (Anchor's `pubkey!` macro
/// requires string literals, not env!()).
///
/// Required keys (build fails if missing):
///   SQUADS_VAULT_PUBKEY     — Squads v4 vault PDA (vaultIndex = 0); set as pool.admin
///   SQUADS_MULTISIG_PUBKEY  — Squads v4 multisig address
///   SQUADS_MEMBER_1 … 4     — 4 member pubkeys (placeholders OK)

use std::io::Write;

fn main() {
    println!("cargo:rerun-if-changed=.env");

    let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(".env");

    dotenvy::from_path(&env_path).unwrap_or_else(|e| {
        panic!(
            "\n\n[bunkercash build] Failed to load {}: {}\n\
             Copy .env.example → .env and fill in the Squads addresses.\n\n",
            env_path.display(),
            e
        )
    });

    let keys = [
        "SQUADS_MULTISIG_PUBKEY",
        "SQUADS_VAULT_PUBKEY",
        "SQUADS_MEMBER_1",
        "SQUADS_MEMBER_2",
        "SQUADS_MEMBER_3",
        "SQUADS_MEMBER_4",
    ];

    let out_dir = std::env::var("OUT_DIR").expect("OUT_DIR set by cargo");
    let out_path = std::path::Path::new(&out_dir).join("squads_keys.rs");
    let mut out = std::fs::File::create(&out_path).expect("create squads_keys.rs");

    for key in &keys {
        let val = std::env::var(key).unwrap_or_else(|_| {
            panic!(
                "\n\n[bunkercash build] Required env var `{}` is missing in .env\n\n",
                key
            )
        });
        writeln!(
            out,
            r#"/// From .env: {}."#,
            key
        )
        .expect("write doc");
        writeln!(
            out,
            r#"pub const {}: Pubkey = pubkey!("{}");"#,
            key,
            val
        )
        .expect("write const");
    }
}
