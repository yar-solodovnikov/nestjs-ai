export type AiResponseErrorReason =
  /** The model hit the output token limit; the answer is incomplete. */
  | 'truncated'
  /** The model declined to answer. */
  | 'refusal'
  /** The provider's safety/content filter blocked the prompt or the answer. */
  | 'blocked'

/**
 * Thrown by adapters when the provider answered, but the answer is unusable:
 * truncated by the token limit, refused, or blocked by a content filter.
 *
 * Sending the same request again would fail the same way, so `parse()` does not retry it
 * (`retryable` is false). The error ends up as `AiError.cause`.
 */
export class AiResponseError extends Error {
  readonly retryable = false

  constructor(
    message: string,
    public readonly provider: string,
    public readonly reason: AiResponseErrorReason,
    /** Provider-specific detail: stop/finish reason, refusal category, block reason. */
    public readonly detail?: string,
  ) {
    super(message)
    this.name = 'AiResponseError'
    Object.setPrototypeOf(this, AiResponseError.prototype)
  }
}
