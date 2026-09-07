# Technical Debt

## Travel rule coverage

`TRAVEL_REQUIRES_ROUTE` currently validates direct `MOVE_CHARACTER` proposals through the existing `RoutePlanner` query. Travel represented as a timeline transaction is independently validated by `TransactionService` and `RoutePlanner` during transaction creation. Do not duplicate or merge those paths until travel transaction proposals have a dedicated, non-cyclic route-validation boundary.

## WP3 parameter and causal boundaries

Genesis remains a creation/bootstrap domain whose initial HP, MP, and gold values may be AI-generated; production balancing normalization is separate work. `PLAYER_ACTION` and `SYSTEM_EVENT` causal bases remain description-backed because they are not yet first-class persisted records. Causal validation currently checks reference integrity, world ownership, and event time only; it does not decide whether an asserted cause semantically justifies an effect.
