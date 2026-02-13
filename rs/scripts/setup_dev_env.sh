#!/bin/bash
set -e

echo "Starting environment setup for BunkerCash..."

# 1. Install Rust
if ! command -v rustup &> /dev/null; then
    echo "Rust/Cargo not found. Installing..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
else
    echo "Rust is already installed."
fi

# 2. Install Solana CLI
# Try release.solana.com first, fallback to GitHub
SOLANA_VERSION="v1.18.18"
SOLANA_ARCH="aarch64-apple-darwin" # Assuming arm64 based on mac context, can detect with uname -m
SOLANA_TARBALL="solana-release-${SOLANA_ARCH}.tar.bz2"
SOLANA_INSTALL_DIR="$HOME/.local/share/solana/install/active_release"

if ! command -v solana &> /dev/null; then
    echo "Solana CLI not found. Installing $SOLANA_VERSION..."
    mkdir -p "$SOLANA_INSTALL_DIR"
    
    echo "Attempting download from release.solana.com..."
    if curl -sSfL "https://release.solana.com/$SOLANA_VERSION/$SOLANA_TARBALL" -o "$SOLANA_TARBALL"; then
        echo "Download successful."
    else
        echo "release.solana.com failed. Trying GitHub direct link..."
        curl -sSfL "https://github.com/solana-labs/solana/releases/download/$SOLANA_VERSION/$SOLANA_TARBALL" -o "$SOLANA_TARBALL"
    fi
    
    tar jxf "$SOLANA_TARBALL" -C "$HOME/.local/share/solana/install/" --strip-components=1 solana-release
    rm "$SOLANA_TARBALL"
    
    export PATH="$SOLANA_INSTALL_DIR/bin:$PATH"
    solana --version
else
    echo "Solana CLI is already installed."
fi

# 3. Install Anchor Version Manager (AVM)
if ! command -v avm &> /dev/null; then
    echo "AVM not found. Installing via Cargo..."
    cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
fi

# 4. Install Anchor
echo "Installing and using Anchor 0.31.1..."
avm install 0.31.1 || avm use 0.31.1
avm use 0.31.1

echo "Setup complete!"
echo ""
echo "Please run the following to update your current shell:"
echo "source \$HOME/.cargo/env"
echo "export PATH=\"$HOME/.local/share/solana/install/active_release/bin:\$PATH\""
echo "export PATH=\"$HOME/.avm/bin:\$PATH\""
