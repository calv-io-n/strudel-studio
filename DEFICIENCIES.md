# BIGGEST UI/UX ISSUES

## OVERALL SENTIMENT

We started with a good thing with teh simple IDE and composition view. Then we overcomplicated it with some very streamlined features.

The UI UX started minimalist (ios apple liquid glass style)... now it's really complicated when really we should just keep the composition and the code-editor tab view. WE NEED TO MAKE THIS SIMPLE IOS STYLE RIGHT NOW THIS IS WAY TOO MUCH CONFIGURATION.

## PROBLEM VIEW: SOUNDS

Sounds needs to be a first class drawer where we can search sounds via tags, names, descriptions

Should be renamed sample library and take the full view as a drawer

## PROBLEM VIEW & WORKFLOW: Transcribe on composition

This speaks more to the foundational issues of the compoisition. I need to be able to control playback similar to video editors like davinci resolve. Lets move the playback controls and scrubbers to the timeline.

We also need to lock the header to scroll through the tracks.

Two scrubbers should be used instead of the complicated loop start and start marker -- this is really complicated. Same with the controls for transcribe on composition.


## PROBLEM: CLOSING TABS -- IF I CLOSE TABS I WANT TO BE ABLE TO OPEN THEM AGAIN FROM A MENU AT THE TOP



# OVERVIEW OF PROBLEMS:
- No "x" button to close a tab
- Can't open closed tabs
- Clicking on note and sounds should be more fluid to either select a new sound sample by typing or record live midi
- Complicated Transcribe on Compostion
- Sounds aka Samples needs to be first class drawer
- Dead UI
- Looping Scrubbers and Play scrubber
- "Play into section" is dead
- UX feels bad when i create a midi from live play


## UI pass implemented

- Split editor/timeline with expand and restore controls; playback lives beside its workspace.
- Safe × tab closing and a searchable Patterns menu for reopening.
- Sample library drawer over a dimmed, blurred workspace; clicking a sound opens it directly for preview and Swap.
- MIDI test mode for the selected library sound, plus an on-screen test keyboard.
- Search across built-ins and local samples; editable tags and descriptions for local samples.
- Timeline range handles and separate playhead; fixed ruler and track headers.
- Explicit audition → capture → review MIDI flow, with secondary take controls disclosed only when needed.

See [Workspace polish](docs/design/workspace-polish.md) for interaction details and verification coverage. Physical controller verification remains a manual check.
