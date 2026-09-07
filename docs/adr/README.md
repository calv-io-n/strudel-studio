# ADRs: decisions to change the design

Architecture decision records document intentional changes from the [target design](../design/strudel-studio.md). They explain why a departure was chosen and what it means. They are neither a feature backlog nor the [as-built architecture](../architecture/README.md).

## Contribute a decision

1. Copy [template.md](template.md) to the next `NNNN-short-title.md` filename. Start with status **Proposed** and a date.
2. Link the exact design section and state the expected behavior before the change. Describe the departure, rationale, alternatives, consequences, and validation.
3. Submit the ADR with the relevant design or implementation PR. An implementation that directly follows the target does not need a departure ADR.
4. Mark the decision **Accepted** when agreed during review. Update the target if the decision changes it, and update architecture documentation when implemented. Link the implementation/PR when available.
5. Preserve accepted decisions. A later reversal gets a new ADR; mark the old one **Superseded by NNNN** and link both records. Rejected proposals may be retained with status **Rejected** and their rationale.

## Index

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-expand-composition-tracks.md) | Accepted | Expand the initial two-lane, whole-cycle design to colored tracks, muting, and fractional snapping |
