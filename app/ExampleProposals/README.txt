ExampleProposals
================

Sample proposals from a real civil engineering firm (MECO Engineering),
shared with permission for this take-home assessment.

proposals/        Document(s) to edit. Pick one or both.

  easy.pdf        8-page single-column Statement of Qualifications.
                  Make this work end-to-end.

  hard.pdf        19-page Statement of Qualifications. Larger, with more
                  layout complexity (tables, mixed sections, embedded
                  branding). Stretch goal.

kb/               Past proposals from the same firm — use as knowledge-base
                  context for the "ground edits in past work" feature.
                  All five are MECO proposals, so the firm's voice, team
                  members, and project conventions are consistent across
                  the corpus. Diverse project types: electrical, bridge,
                  city services, demolition, transportation grant.

  monroe_city_electrical_soq.pdf    Electrical project
  nemo_rpc_bridge_soq.pdf           Bridge project
  macon_city_soq.pdf                City engineering services
  hannibal_demolition_soq.pdf       Demolition project
  palmyra_modot_tap_soq.pdf         MoDOT transportation grant

Notes
-----

Output format is your call. PDF, DOCX, markdown, HTML, plain text — pick
whatever fits the use case. Don't feel you need to reproduce the original
PDF's visual fidelity. Faithful PDF reconstruction (preserving fonts,
embedded graphics, exact layout) is a genuinely hard problem that
commercial libraries solve at significant licensing cost. The core
problem is the edit loop, not PDF reconstruction.

AI-based PDF parsing can be slow (5–10 minutes for large PDFs). Plan
around this — cache parse results, work with the easy fixture during
development.
