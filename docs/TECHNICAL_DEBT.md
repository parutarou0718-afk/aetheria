# Technical Debt

## Travel rule coverage

`TRAVEL_REQUIRES_ROUTE` currently validates direct `MOVE_CHARACTER` proposals through the existing `RoutePlanner` query. Travel represented as a timeline transaction is independently validated by `TransactionService` and `RoutePlanner` during transaction creation. Do not duplicate or merge those paths until travel transaction proposals have a dedicated, non-cyclic route-validation boundary.
