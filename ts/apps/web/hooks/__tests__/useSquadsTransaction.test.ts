import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { PublicKey } from "@solana/web3.js"

// ── Stable keys used across all tests ──────────────────────────────────────
const WALLET_PUBKEY = new PublicKey(
  "3BXEsRgUmrTudbZDzQjDpA2mvwV7vDC73WGjhHPRGBee",
)
const NON_MEMBER_PUBKEY = new PublicKey(
  "11111111111111111111111111111111",
)
const MULTISIG_PDA = new PublicKey(
  "Gy7ZQFZ4Y5qgSJT9E9nJTrHBTSjzB6cv9n2gLcedjiS",
)
const VAULT_PDA = new PublicKey(
  "J3dxNj7nDRRqRRXuEMynDG57DkZK4jYRuv3Garmb1i99",
)
const PROPOSAL_PDA = new PublicKey(
  "5ZWj7a1f8tWkjBESHKgrLRgsAnm3UJ2BHqJqADkJZ1Jb",
)
const TRANSACTION_PDA = new PublicKey(
  "6zKxvzLz1oD8YkERvUPY7oMfLQnNwRAz6Cy2hqkDFmUi",
)
const BLOCKHASH = "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N"
const SIG1 = "sig-vault-tx-create-111"
const SIG2 = "sig-proposal-approve-222"

// ── Mock @solana/wallet-adapter-react ──────────────────────────────────────
const mockSignAllTransactions = vi.fn()
const mockSendTransaction = vi.fn()
const mockConfirmTransaction = vi.fn()
const mockGetLatestBlockhash = vi.fn()

vi.mock("@solana/wallet-adapter-react", () => ({
  useConnection: () => ({
    connection: {
      rpcEndpoint: "https://api.devnet.solana.com",
      getLatestBlockhash: mockGetLatestBlockhash,
      sendTransaction: mockSendTransaction,
      confirmTransaction: mockConfirmTransaction,
    },
  }),
  useWallet: () => ({
    publicKey: WALLET_PUBKEY,
    signAllTransactions: mockSignAllTransactions,
  }),
}))

// ── Mock @sqds/multisig ───────────────────────────────────────────────────
const mockFromAccountAddress = vi.fn()
const mockVaultTransactionCreate = vi.fn()
const mockProposalCreate = vi.fn()
const mockProposalApprove = vi.fn()
const mockGetProposalPda = vi.fn()
const mockGetTransactionPda = vi.fn()

vi.mock("@sqds/multisig", () => ({
  accounts: {
    Multisig: {
      fromAccountAddress: (...args: unknown[]) =>
        mockFromAccountAddress(...args),
    },
  },
  instructions: {
    vaultTransactionCreate: (...args: unknown[]) =>
      mockVaultTransactionCreate(...args),
    proposalCreate: (...args: unknown[]) => mockProposalCreate(...args),
    proposalApprove: (...args: unknown[]) => mockProposalApprove(...args),
  },
  getProposalPda: (...args: unknown[]) => mockGetProposalPda(...args),
  getTransactionPda: (...args: unknown[]) => mockGetTransactionPda(...args),
}))

// ── Mock @/lib/constants ──────────────────────────────────────────────────
vi.mock("@/lib/constants", () => ({
  SQUADS_MULTISIG_PUBKEY: MULTISIG_PDA,
  SQUADS_VAULT_PUBKEY: VAULT_PDA,
  getSquadsDashboardUrl: (_cluster: string, pda: PublicKey) =>
    `https://devnet.squads.so/multisig/${pda.toBase58()}`,
  getClusterFromEndpoint: () => "devnet",
}))

// ── Dummy instruction (placeholder to pass into submit()) ─────────────────
const dummyInstruction = {
  keys: [],
  programId: PublicKey.default,
  data: Buffer.alloc(0),
}

// ── Import the hook (AFTER mocks are set up) ──────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useSquadsTransaction } = await import("../useSquadsTransaction")

// ── Helpers ───────────────────────────────────────────────────────────────
function setupHappyPathMocks(opts?: { transactionIndex?: number }) {
  const txIndex = opts?.transactionIndex ?? 5

  mockFromAccountAddress.mockResolvedValue({
    transactionIndex: BigInt(txIndex),
    members: [{ key: WALLET_PUBKEY }],
  })

  mockGetLatestBlockhash.mockResolvedValue({
    blockhash: BLOCKHASH,
    lastValidBlockHeight: 200,
  })

  // Return plain objects as instruction stubs (they only need to exist)
  mockVaultTransactionCreate.mockReturnValue({
    keys: [],
    programId: PublicKey.default,
    data: Buffer.alloc(4),
  })
  mockProposalCreate.mockReturnValue({
    keys: [],
    programId: PublicKey.default,
    data: Buffer.alloc(4),
  })
  mockProposalApprove.mockReturnValue({
    keys: [],
    programId: PublicKey.default,
    data: Buffer.alloc(4),
  })

  // signAllTransactions returns the same txs (we don't verify sigs in unit tests)
  mockSignAllTransactions.mockImplementation((txs: unknown[]) =>
    Promise.resolve(txs),
  )

  mockSendTransaction
    .mockResolvedValueOnce(SIG1)
    .mockResolvedValueOnce(SIG2)

  mockConfirmTransaction.mockResolvedValue({ value: {} })

  mockGetProposalPda.mockReturnValue([PROPOSAL_PDA])
  mockGetTransactionPda.mockReturnValue([TRANSACTION_PDA])
}

// ── Tests ─────────────────────────────────────────────────────────────────
describe("useSquadsTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Happy path ──────────────────────────────────────────────────────────
  it("should split vault-create and proposal-approve into two transactions", async () => {
    setupHappyPathMocks()

    const { result } = renderHook(() => useSquadsTransaction())

    let submitResult: Awaited<ReturnType<typeof result.current.submit>>
    await act(async () => {
      submitResult = await result.current.submit([dummyInstruction], "test memo")
    })

    // signAllTransactions should be called with exactly 2 transactions
    expect(mockSignAllTransactions).toHaveBeenCalledTimes(1)
    const signedTxs = mockSignAllTransactions.mock.calls[0][0]
    expect(signedTxs).toHaveLength(2)

    // sendTransaction should be called twice (TX1 then TX2)
    expect(mockSendTransaction).toHaveBeenCalledTimes(2)

    // confirmTransaction should be called twice
    expect(mockConfirmTransaction).toHaveBeenCalledTimes(2)

    // Result should contain the correct data
    expect(submitResult!).not.toBeNull()
    expect(submitResult!.txIndex).toBe(BigInt(6)) // 5 + 1
    expect(submitResult!.signature).toBe(SIG1)
    expect(submitResult!.autoApproved).toBe(true)
    expect(submitResult!.proposalPda).toBe(PROPOSAL_PDA.toBase58())
    expect(submitResult!.transactionPda).toBe(TRANSACTION_PDA.toBase58())
    expect(submitResult!.squadsUrl).toContain("devnet.squads.so")
  })

  // ── Transaction index increments correctly ──────────────────────────────
  it("should use transactionIndex + 1 as the next index", async () => {
    setupHappyPathMocks({ transactionIndex: 42 })

    const { result } = renderHook(() => useSquadsTransaction())

    await act(async () => {
      await result.current.submit([dummyInstruction])
    })

    // Check that vaultTransactionCreate was called with nextIndex = 43
    expect(mockVaultTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ transactionIndex: BigInt(43) }),
    )
    expect(mockProposalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ transactionIndex: BigInt(43) }),
    )
    expect(mockProposalApprove).toHaveBeenCalledWith(
      expect.objectContaining({ transactionIndex: BigInt(43) }),
    )
  })

  // ── Sends TX1 before TX2 (sequential order) ────────────────────────────
  it("should send transactions sequentially (TX1 confirmed before TX2 sent)", async () => {
    setupHappyPathMocks()

    const callOrder: string[] = []
    mockSendTransaction.mockImplementation(async () => {
      const idx = callOrder.filter((c) => c === "send").length
      callOrder.push("send")
      return idx === 0 ? SIG1 : SIG2
    })
    mockConfirmTransaction.mockImplementation(async () => {
      callOrder.push("confirm")
      return { value: {} }
    })

    const { result } = renderHook(() => useSquadsTransaction())

    await act(async () => {
      await result.current.submit([dummyInstruction])
    })

    // Order should be: send, confirm, send, confirm
    expect(callOrder).toEqual(["send", "confirm", "send", "confirm"])
  })

  // ── Memo is forwarded correctly ─────────────────────────────────────────
  it("should pass memo to vaultTransactionCreate and proposalApprove", async () => {
    setupHappyPathMocks()

    const { result } = renderHook(() => useSquadsTransaction())

    await act(async () => {
      await result.current.submit([dummyInstruction], "Process claim #7")
    })

    expect(mockVaultTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ memo: "Process claim #7" }),
    )
    expect(mockProposalApprove).toHaveBeenCalledWith(
      expect.objectContaining({ memo: "approve: Process claim #7" }),
    )
  })

  // ── No memo → no approve memo ──────────────────────────────────────────
  it("should not pass approve memo when no memo is provided", async () => {
    setupHappyPathMocks()

    const { result } = renderHook(() => useSquadsTransaction())

    await act(async () => {
      await result.current.submit([dummyInstruction])
    })

    expect(mockProposalApprove).toHaveBeenCalledWith(
      expect.objectContaining({ memo: undefined }),
    )
  })

  // ── Non-member wallet is rejected ───────────────────────────────────────
  it("should throw if wallet is not a multisig member", async () => {
    mockFromAccountAddress.mockResolvedValue({
      transactionIndex: BigInt(1),
      members: [{ key: NON_MEMBER_PUBKEY }], // wallet not in list
    })
    mockGetLatestBlockhash.mockResolvedValue({
      blockhash: BLOCKHASH,
      lastValidBlockHeight: 200,
    })

    const { result } = renderHook(() => useSquadsTransaction())

    await expect(
      act(async () => {
        await result.current.submit([dummyInstruction])
      }),
    ).rejects.toThrow("not a member")

    expect(result.current.error).toContain("not a member")
    expect(mockSignAllTransactions).not.toHaveBeenCalled()
  })

  // ── Wallet not connected ───────────────────────────────────────────────
  it("should return null and set error when wallet is not connected", async () => {
    // Override useWallet to return no publicKey
    const originalUseWallet = vi.mocked(
      (await import("@solana/wallet-adapter-react")).useWallet,
    )
    originalUseWallet.mockReturnValueOnce({
      publicKey: null,
      signAllTransactions: null,
    } as never)

    const { result } = renderHook(() => useSquadsTransaction())

    let submitResult: unknown
    await act(async () => {
      submitResult = await result.current.submit([dummyInstruction])
    })

    expect(submitResult).toBeNull()
    expect(result.current.error).toBe("Wallet not connected")
  })

  // ── isSubmitting lifecycle ──────────────────────────────────────────────
  it("should set isSubmitting to true during submission and false after", async () => {
    setupHappyPathMocks()

    const { result } = renderHook(() => useSquadsTransaction())

    expect(result.current.isSubmitting).toBe(false)

    let resolveBlockhash: (v: unknown) => void
    mockGetLatestBlockhash.mockReturnValue(
      new Promise((resolve) => {
        resolveBlockhash = resolve
      }),
    )

    let submitPromise: Promise<unknown>
    act(() => {
      submitPromise = result.current.submit([dummyInstruction])
    })

    // isSubmitting should be true while awaiting
    expect(result.current.isSubmitting).toBe(true)

    // Resolve and let it complete
    await act(async () => {
      resolveBlockhash!({
        blockhash: BLOCKHASH,
        lastValidBlockHeight: 200,
      })
      await submitPromise
    })

    expect(result.current.isSubmitting).toBe(false)
  })

  // ── Error during sendTransaction sets error state ───────────────────────
  it("should set error state if sendTransaction fails", async () => {
    setupHappyPathMocks()
    mockSendTransaction.mockReset()
    mockSendTransaction.mockRejectedValue(new Error("Network congestion"))

    const { result } = renderHook(() => useSquadsTransaction())

    await expect(
      act(async () => {
        await result.current.submit([dummyInstruction])
      }),
    ).rejects.toThrow("Network congestion")

    expect(result.current.error).toBe("Network congestion")
    expect(result.current.isSubmitting).toBe(false)
  })

  // ── Error during confirmTransaction (TX1) sets error state ──────────────
  it("should set error and stop if TX1 confirmation fails", async () => {
    setupHappyPathMocks()
    mockConfirmTransaction.mockReset()
    mockConfirmTransaction.mockRejectedValueOnce(
      new Error("Transaction expired"),
    )

    const { result } = renderHook(() => useSquadsTransaction())

    await expect(
      act(async () => {
        await result.current.submit([dummyInstruction])
      }),
    ).rejects.toThrow("Transaction expired")

    expect(result.current.error).toBe("Transaction expired")
    // TX2 should never have been sent
    expect(mockSendTransaction).toHaveBeenCalledTimes(1)
  })

  // ── Vault index is always 0 ─────────────────────────────────────────────
  it("should always use vault index 0", async () => {
    setupHappyPathMocks()

    const { result } = renderHook(() => useSquadsTransaction())

    await act(async () => {
      await result.current.submit([dummyInstruction])
    })

    expect(mockVaultTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ vaultIndex: 0, ephemeralSigners: 0 }),
    )
  })

  // ── Creator is the connected wallet ─────────────────────────────────────
  it("should use the connected wallet as creator and member", async () => {
    setupHappyPathMocks()

    const { result } = renderHook(() => useSquadsTransaction())

    await act(async () => {
      await result.current.submit([dummyInstruction])
    })

    expect(mockVaultTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ creator: WALLET_PUBKEY }),
    )
    expect(mockProposalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ creator: WALLET_PUBKEY }),
    )
    expect(mockProposalApprove).toHaveBeenCalledWith(
      expect.objectContaining({ member: WALLET_PUBKEY }),
    )
  })

  // ── Proposal isDraft is false ───────────────────────────────────────────
  it("should create an active (non-draft) proposal", async () => {
    setupHappyPathMocks()

    const { result } = renderHook(() => useSquadsTransaction())

    await act(async () => {
      await result.current.submit([dummyInstruction])
    })

    expect(mockProposalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ isDraft: false }),
    )
  })

  // ── Confirmation uses blockhash strategy ────────────────────────────────
  it("should use blockhash-based confirmation with lastValidBlockHeight", async () => {
    setupHappyPathMocks()

    const { result } = renderHook(() => useSquadsTransaction())

    await act(async () => {
      await result.current.submit([dummyInstruction])
    })

    // Both confirmTransaction calls should use the blockhash strategy
    expect(mockConfirmTransaction).toHaveBeenCalledWith(
      { signature: SIG1, blockhash: BLOCKHASH, lastValidBlockHeight: 200 },
      "confirmed",
    )
    expect(mockConfirmTransaction).toHaveBeenCalledWith(
      { signature: SIG2, blockhash: BLOCKHASH, lastValidBlockHeight: 200 },
      "confirmed",
    )
  })
})
