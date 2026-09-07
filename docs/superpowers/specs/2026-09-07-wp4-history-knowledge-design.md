# WP4 World Truth, Observer Knowledge, and History Design

**Status:** Approved by the supplied WP4 engineering directive.

## Boundaries

World truth remains the authoritative state held by `WorldRepository` and changed only through `Recorder`. `ObservedHistory` remains the sole observer-scoped history and knowledge store. `Character.memory` remains narrative recall only, while legacy `Character.knowledge` remains compatibility data and is not promoted or synchronized.

## Commit Policy

The proposal pipeline will evaluate the resolved proposal in this order: Schema, Authority, Causal Basis, Parameter Resolution, World Rule, Preconditions, History Conflict, Recorder. A history conflict is a normal structured rejection and rejects its whole batch before Recorder.

History validation projects only supported operations into canonical state paths. Only immutable `CONFIRMED_FACT` observations constrain an earlier effective epoch, and only when the projected after-value contradicts the observed value. Claims, rumors, inferences, compatible retroactive proposals, and later mutations remain allowed.

## Observer Knowledge

`ObserverKnowledgeService` reads only `ObservedHistory`. It filters future records, combines a matching observer's private observations with `PUBLIC` observations, deduplicates confirmed fields to the latest eligible value, and keeps claims, rumors, and inferences distinct. It never fills gaps by reading world truth.

NPC dialogue will use this read model in its prompt, with only direct interaction context, structured observer knowledge, and narrative memories. It will not include hidden truths or other observers' private records. Its memory, relationship, direct-observation, and dialogue-claim proposals will be sent in one atomic ProposalPipeline batch.

## Non-goals

No second history database, full temporal reconstruction, generic observation broadcast, party permissions, automatic truth-reveal propagation, LLM truth judging, proposal repair, input mode, quest runtime, or NPC autonomy is introduced.
