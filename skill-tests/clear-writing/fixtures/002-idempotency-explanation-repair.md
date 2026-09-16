# Fixture GOV-002: idempotency explanation repair

## Task

Respond to the user after the previous explanation failed.

Use only the supplied technical facts.

Expected mode: Technical explanation.

## Exchange

Previous answer:

> Idempotency means that making the same request more than once has the same effect as making it once. A payment endpoint should be idempotent so retrying a request does not duplicate the operation.

User response:

> I still do not understand why a payment endpoint needs this. We already use a database transaction, and retries are rare.

## Audience

The user understands HTTP requests and database transactions. They do not yet understand distributed failure modes between a client and server.

## Supplied facts

- The server can commit the payment before the client receives the response.
- The client may then retry because it saw a timeout or network failure.
- Each retry can run in a separate database transaction.
- The service stores the result against `Idempotency-Key` for 24 hours.
- On a retry with the same `Idempotency-Key`, the service returns the stored result instead of creating a second payment.
- The tradeoff is storage and expiry management.

## Acceptance checks

- selects Technical explanation and treats the task as explanation repair
- identifies the missing premise: a committed result can exist even when the client receives no response
- uses a meaningfully different route instead of shortening the original definition
- gives one concrete payment sequence and maps it back to transactions and `Idempotency-Key`
- distinguishes transaction atomicity from deduplication across requests
- ends with the practical point, the storage or expiry tradeoff, and one focused comprehension check
- does not end with a generic "Does that make sense?"

## Failure tags

`wrong mode`, `technical reference missed`, `same-route repair`, `example unmapped`, `tradeoff missing`, `fact drift`
