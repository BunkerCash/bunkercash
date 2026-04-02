"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { AlertCircle, CheckCircle2, Coins, Loader2, RefreshCw } from "lucide-react";
import { getBunkercashMintPda, getPoolPda, getProgram, PROGRAM_ID } from "@/lib/program";

const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const DEFAULT_TOKEN_NAME = "bunkerCash";
const DEFAULT_TOKEN_SYMBOL = "bunkerCash";
const DEFAULT_TOKEN_METADATA_URI =
  process.env.NEXT_PUBLIC_TOKEN_METADATA_URI ??
  "https://bunkercash-web.bunkercoin.workers.dev/bunkercash-metadata.json";

interface PoolAccountLike {
  masterWallet: PublicKey;
}

interface MintSetupMethods {
  createBrentMint: () => {
    accounts: (accounts: {
      pool: PublicKey;
      brentMint: PublicKey;
      admin: PublicKey;
      tokenProgram: PublicKey;
      systemProgram: PublicKey;
    }) => {
      rpc: () => Promise<string>;
    };
  };
  initMintMetadata: (name: string, symbol: string, uri: string) => {
    accounts: (accounts: {
      pool: PublicKey;
      brentMint: PublicKey;
      admin: PublicKey;
      metadata: PublicKey;
      tokenMetadataProgram: PublicKey;
      tokenProgram: PublicKey;
      systemProgram: PublicKey;
      sysvarInstructions: PublicKey;
    }) => {
      rpc: () => Promise<string>;
    };
  };
  updateMintMetadata: (name: string, symbol: string, uri: string) => {
    accounts: (accounts: {
      pool: PublicKey;
      brentMint: PublicKey;
      admin: PublicKey;
      metadata: PublicKey;
      tokenMetadataProgram: PublicKey;
    }) => {
      rpc: () => Promise<string>;
    };
  };
}

export function MintSetupCard() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const program = useMemo(
    () => (wallet.publicKey ? getProgram(connection, wallet) : null),
    [connection, wallet],
  );
  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), []);
  const mintPda = useMemo(() => getBunkercashMintPda(PROGRAM_ID), []);
  const metadataPda = useMemo(
    () =>
      PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mintPda.toBuffer()],
        TOKEN_METADATA_PROGRAM_ID,
      )[0],
    [mintPda],
  );

  const [loading, setLoading] = useState(true);
  const [submittingAction, setSubmittingAction] = useState<"mint" | "metadata" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isMintInitialized, setIsMintInitialized] = useState(false);
  const [isMetadataInitialized, setIsMetadataInitialized] = useState(false);
  const [masterWallet, setMasterWallet] = useState<string | null>(null);
  const [tokenName, setTokenName] = useState(DEFAULT_TOKEN_NAME);
  const [tokenSymbol, setTokenSymbol] = useState(DEFAULT_TOKEN_SYMBOL);
  const [tokenUri, setTokenUri] = useState(DEFAULT_TOKEN_METADATA_URI);

  const fetchState = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const readonlyProgram = program ?? null;
      if (!readonlyProgram) {
        const [mintInfo, metadataInfo] = await Promise.all([
          connection.getAccountInfo(mintPda),
          connection.getAccountInfo(metadataPda),
        ]);
        setIsMintInitialized(!!mintInfo);
        setIsMetadataInitialized(!!metadataInfo);
        return;
      }

      const accountApi = readonlyProgram.account as {
        pool: { fetch: (pubkey: PublicKey) => Promise<PoolAccountLike> };
      };
      const [poolState, mintInfo, metadataInfo] = await Promise.all([
        accountApi.pool.fetch(poolPda),
        connection.getAccountInfo(mintPda),
        connection.getAccountInfo(metadataPda),
      ]);

      setMasterWallet(poolState.masterWallet.toBase58());
      setIsMintInitialized(!!mintInfo);
      setIsMetadataInitialized(!!metadataInfo);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e ?? "Failed to load mint status");
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [connection, metadataPda, mintPda, poolPda, program]);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  const handleInitializeMint = async () => {
    if (!program || !wallet.publicKey) return;

    setSubmittingAction("mint");
    setError(null);
    setSuccess(null);

    try {
      const methodsApi = program.methods as unknown as MintSetupMethods;
      const signature = await methodsApi
        .createBrentMint()
        .accounts({
          pool: poolPda,
          brentMint: mintPda,
          admin: wallet.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setSuccess(`Mint initialized. Tx: ${signature}`);
      setIsMintInitialized(true);
      await fetchState();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e ?? "Mint initialization failed");
      setError(message);
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleSaveMetadata = async () => {
    if (!program || !wallet.publicKey) return;

    const name = tokenName.trim();
    const symbol = tokenSymbol.trim();
    const uri = tokenUri.trim();

    if (!name || !symbol || !uri) {
      setError("Name, symbol, and metadata URI are required.");
      return;
    }

    setSubmittingAction("metadata");
    setError(null);
    setSuccess(null);

    try {
      const methodsApi = program.methods as unknown as MintSetupMethods;
      const builder = isMetadataInitialized
        ? methodsApi.updateMintMetadata(name, symbol, uri).accounts({
            pool: poolPda,
            brentMint: mintPda,
            admin: wallet.publicKey,
            metadata: metadataPda,
            tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
          })
        : methodsApi.initMintMetadata(name, symbol, uri).accounts({
            pool: poolPda,
            brentMint: mintPda,
            admin: wallet.publicKey,
            metadata: metadataPda,
            tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
          });

      const signature = await builder.rpc();
      setSuccess(
        `${isMetadataInitialized ? "Metadata updated" : "Metadata initialized"}. Tx: ${signature}`,
      );
      setIsMetadataInitialized(true);
      await fetchState();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e ?? "Metadata transaction failed");
      setError(message);
    } finally {
      setSubmittingAction(null);
    }
  };

  return (
    <section className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-300">
            <Coins className="h-4 w-4 text-[#00FFB2]" />
            Mint Setup
          </div>
          <h1 className="text-xl font-semibold text-white">Bunker Cash Mint</h1>
          <p className="mt-1 text-sm text-neutral-500">
            The buy flow requires the on-chain `bunkercash_mint` PDA to exist. This is a one-time
            admin action signed by your Phantom wallet.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void fetchState()}
          className="rounded-lg border border-neutral-800 p-2 text-neutral-400 transition hover:border-neutral-700 hover:text-white"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="mb-2 text-xs uppercase tracking-[0.2em] text-neutral-500">Program</div>
          <div className="break-all font-mono text-sm text-neutral-200">{PROGRAM_ID.toBase58()}</div>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="mb-2 text-xs uppercase tracking-[0.2em] text-neutral-500">Mint PDA</div>
          <div className="break-all font-mono text-sm text-neutral-200">{mintPda.toBase58()}</div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
        <div className="mb-2 text-xs uppercase tracking-[0.2em] text-neutral-500">Metadata PDA</div>
        <div className="break-all font-mono text-sm text-neutral-200">{metadataPda.toBase58()}</div>
      </div>

      <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
        <div className="mb-2 text-xs uppercase tracking-[0.2em] text-neutral-500">On-Chain Admin</div>
        <div className="break-all font-mono text-sm text-neutral-200">
          {masterWallet ?? "Connect admin wallet to load"}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
        <div className="mb-2 text-xs uppercase tracking-[0.2em] text-neutral-500">Status</div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking mint state...
          </div>
        ) : isMintInitialized ? (
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Mint PDA is initialized.
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-amber-400">
            <AlertCircle className="h-4 w-4" />
            Mint PDA is missing. Initialize it once from this admin wallet.
          </div>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
        <div className="mb-2 text-xs uppercase tracking-[0.2em] text-neutral-500">Metadata Status</div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking metadata state...
          </div>
        ) : isMetadataInitialized ? (
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Token metadata account exists.
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-amber-400">
            <AlertCircle className="h-4 w-4" />
            Metadata is missing. Phantom will typically show this mint as Unknown Token.
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          {success}
        </div>
      )}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleInitializeMint()}
          disabled={!wallet.publicKey || isMintInitialized || submittingAction !== null || loading}
          className="inline-flex items-center gap-2 rounded-xl bg-[#00FFB2] px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submittingAction === "mint" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
          Initialize Bunker Cash Mint
        </button>

        {!wallet.publicKey && <span className="text-sm text-neutral-500">Connect your admin Phantom wallet first.</span>}
      </div>

      <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
        <div className="mb-4">
          <div className="mb-2 text-xs uppercase tracking-[0.2em] text-neutral-500">Token Metadata</div>
          <p className="text-sm text-neutral-500">
            Set the display name, symbol, and public metadata JSON URI used by Phantom and explorers.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm text-neutral-300">Name</span>
            <input
              value={tokenName}
              onChange={(event) => setTokenName(event.target.value)}
              className="w-full rounded-xl border border-neutral-800 bg-black/40 px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#00FFB2]"
              placeholder={DEFAULT_TOKEN_NAME}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-neutral-300">Symbol</span>
            <input
              value={tokenSymbol}
              onChange={(event) => setTokenSymbol(event.target.value)}
              className="w-full rounded-xl border border-neutral-800 bg-black/40 px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#00FFB2]"
              placeholder={DEFAULT_TOKEN_SYMBOL}
            />
          </label>
        </div>

        <label className="mt-4 block">
          <span className="mb-2 block text-sm text-neutral-300">Metadata URI</span>
          <input
            value={tokenUri}
            onChange={(event) => setTokenUri(event.target.value)}
            className="w-full rounded-xl border border-neutral-800 bg-black/40 px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#00FFB2]"
            placeholder={DEFAULT_TOKEN_METADATA_URI}
          />
        </label>

        <p className="mt-3 text-xs text-neutral-500">
          The URI must be publicly reachable and return a Metaplex-style JSON document.
        </p>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSaveMetadata()}
            disabled={!wallet.publicKey || !isMintInitialized || submittingAction !== null || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-[#00FFB2]/40 bg-[#00FFB2]/10 px-4 py-2.5 text-sm font-semibold text-[#00FFB2] transition hover:bg-[#00FFB2]/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submittingAction === "metadata" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {isMetadataInitialized ? "Update Metadata" : "Set Metadata"}
          </button>

          {!isMintInitialized && (
            <span className="text-sm text-neutral-500">Initialize the mint first.</span>
          )}
        </div>
      </div>
    </section>
  );
}
