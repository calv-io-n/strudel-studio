# Example sessions

**Start with a song, then make it yours.** [Neon Drive](neon-drive/README.md) is the synth-only demo. The six DnB sessions use a curated library of 26 real sample sounds alongside original melodies and synthesized sub bass.

| Session | Style | Tempo / key | Tracks |
| --- | --- | --- | --- |
| [First Light](first-light/README.md) | Euphoric dancefloor | 174 BPM · F♯ minor | 8 |
| [Afterglow](afterglow/README.md) | Melodic liquid | 174 BPM · A minor | 8 |
| [Skyline](skyline/README.md) | Soaring festival DnB | 174 BPM · B minor | 9 |
| [Solar Tide](solar-tide/README.md) | Sunlit melodic DnB | 172 BPM · D minor | 9 |
| [Higher Ground](higher-ground/README.md) | Staccato dancefloor DnB | 176 BPM · C minor | 9 |
| [Northern Lights](northern-lights/README.md) | Atmospheric euphoric DnB | 174 BPM · E minor | 9 |

## Download the sounds

These free SampleRadar packs have direct ZIP downloads and need no account or mailing-list signup. The original WAV files are not included in this repository.

| Pack | What we use | Publisher |
| --- | --- | --- |
| DnB Essentials | Drum hits, two-bar breaks, bass multisamples, transitions | [MusicRadar](https://www.musicradar.com/news/sampleradar-dnb-essentials-samples) |
| Old School Euphoria | Synth multisamples and major/minor chord hits | [MusicRadar](https://www.musicradar.com/news/sampleradar-free-euphoric-trance-samples) |
| DnB Pads | Open-fifth atmosphere and a spare pad for variations | [MusicRadar](https://www.musicradar.com/news/tech/sampleradar-130-free-drum-n-bass-pad-samples-449476) |

From the repository root, download and extract with `curl` and `unzip`, or use your browser and archive manager to create the same folder layout:

```bash
mkdir -p .local/dnb-packs
curl -fL --retry 2 https://cdn.mos.musicradar.com/audio/samples/sampleradar-dnb-essentials-samples.zip -o .local/dnb-packs/essentials.zip
curl -fL --retry 2 https://cdn.mos.musicradar.com/audio/samples/sampleradar-old-school-euphoria-samples.zip -o .local/dnb-packs/euphoria.zip
curl -fL --retry 2 https://cdn.mos.musicradar.com/audio/samples/musicradar-dnb-pad-samples.zip -o .local/dnb-packs/pads.zip
unzip -n .local/dnb-packs/essentials.zip -d .local/dnb-packs/essentials
unzip -n .local/dnb-packs/euphoria.zip -d .local/dnb-packs/euphoria
unzip -n .local/dnb-packs/pads.zip -d .local/dnb-packs/pads
```

Allow roughly 2 GB for the archives and extracted packs. The installer imports only the 26 selected sounds. Large archives exceed the browser ZIP import limit; the installer reads the extracted WAVs individually through Studio’s existing import API.

## Add the sessions

Start Studio with `npm run dev`. In a second terminal:

```bash
npm run studio:dnb
```

Refresh Studio and choose a song from **Sessions**. Open **Composition** and press **Play composition**. Choose **Project → Export → Render & download WAV** to render a complete mix, including the three-second default effect tail.

The installer retains existing named sessions and reuses identical imported audio. It leaves the recovery session alone. Samples are installed into the running server’s configured sound directory, normally `samples/ai/`, with source filenames and publisher links. Patterns use named sound slots so their sample assignments remain editable.

For a different download folder or Studio port:

```bash
STUDIO_URL=http://127.0.0.1:5174 npm run studio:dnb -- /path/to/dnb-packs
```

That source folder must contain `essentials/D_B Essentials/`, `euphoria/Old School Euphoria/`, and `pads/musicradar-dnb-pad-samples/`. The complete selection is recorded in [dnb-samples.json](dnb-samples.json).

## Explore a song

Each folder contains commented `.strudel` patterns and an `arrangement.json` with track assignments and section boundaries. A cycle is one four-beat bar. Every song runs for 128 bars: 16 intro, 16 build, 32 drop, 16 breakdown, 8 rebuild, 32 second drop, and 8 outro.

- **Drums / Breaks:** programmed one-shots plus recorded two-bar breaks fitted to the song tempo. Fills mark phrase endings.
- **Sub / Bass texture:** a centered sine foundation and a sampled upper bass layer.
- **Chords / Melody:** original note patterns, tuned sampled chords and separate quieter intro/breakdown versions.
- **Atmosphere / Transitions:** pitched pads, swells, crashes and reverse hits.
- **Sparkle:** the four additional songs add a high counterline during the second half of each drop.

Solo a track to hear its role. Open a clip’s source to edit a pattern; typing stays a draft until **Apply changes** during playback. The installer does not replace your edits on subsequent runs. To develop a variation, save it as a separate session before changing the original.

## Keep the music and its sources

SampleRadar permits using the samples in your music and asks that you do not redistribute the samples themselves; see the publisher pages above. Keep raw packs and sample-containing backups local. A rendered composition and a folder of raw samples are different deliverables.

Back up the named sessions together with their referenced sounds, or use **Project → Download project backup** for a local archive. WAV export preserves the finished sound; it does not preserve the editable arrangement.
