import './quick-start.css';

/** Instructions use the current control labels; opening help never changes a session. */
export function installQuickStart() {
  const dialog = document.createElement('dialog');
  dialog.id = 'quick-start';
  dialog.setAttribute('aria-labelledby', 'quick-start-title');
  dialog.innerHTML = `
    <header class="quick-start-header"><div><span class="quick-start-eyebrow">Strudel Studio · Quick start</span><h2 id="quick-start-title">From your hands to a track.</h2></div><form method="dialog"><button aria-label="Close quick start" autofocus>Close</button></form></header>
    <p class="quick-start-intro">Use a desktop browser. Patterns hold your code. Clips place that code on a track. Playing an input lets you hear it; recording keeps a take.</p>
    <div class="quick-start-motion"><span>Watch the action, then try it in your session.</span><button type="button" id="quick-start-motion" aria-pressed="false">Pause animations</button></div>
    <nav class="quick-start-nav" aria-label="Quick start topics"><a href="#help-inputs">Connect</a><a href="#help-arrange">Arrange</a><a href="#help-audio">Record audio</a><a href="#help-midi">Record MIDI</a><a href="#help-mapping">Map a knob</a></nav>
    <div class="quick-start-sections">
      <section id="help-inputs" tabindex="-1"><span class="quick-start-number" aria-hidden="true">01</span><h3>Connect your MIDI keyboard.</h3><p><strong>MIDI keyboard:</strong> open <b>MIDI</b> in the bottom bar, choose <b>Enable MIDI</b>, select your input, then <b>Connect</b>. Play a key to check the activity message.</p><p>Open the <b>MIDI instrument</b> tab to choose its sound and effects. Use <b>Apply instrument</b> after editing the code.</p><p class="quick-start-note">Your sessions are stored in this browser. Use the + beside Sessions to start your own; download a project backup to keep a separate copy.</p></section>
      <section id="help-arrange" tabindex="-1"><span class="quick-start-number" aria-hidden="true">02</span><h3>Put a pattern on a track.</h3><p><strong>Grab a named pattern tab and drag it down to a track.</strong> The matching colored block is a clip: it tells the composition when to play that pattern.</p><p>Or open the pattern’s <b>•••</b> menu and choose <b>Add to composition</b>. Stop playback before adding or moving clips.</p><p class="quick-start-note">Audio input and MIDI instrument are input editors. To arrange music, use a named pattern or a recorded take. The current timeline starts at cycle 0; one cycle is four beats.</p></section>
      <section id="help-audio" tabindex="-1"><span class="quick-start-number" aria-hidden="true">03</span><h3>Record your microphone.</h3><ol><li>In <b>Audio input</b>, choose <b>Connect microphone</b> and allow browser access. Select your device and channel, then check the Input meter. Turn on <b>Monitor input</b> if you want to hear it through Studio.</li><li>In the composition, choose a track under <b>Record to</b> and move the playhead to an empty space.</li><li>Choose <b>Record audio input</b>, perform, then stop the recording. Your take is saved onto the timeline.</li></ol><p class="quick-start-note">Monitoring is listening, not recording. Stop turns monitoring off; turn it on again when needed. A muted track or another soloed track can also silence monitoring.</p></section>
      <section id="help-midi" tabindex="-1"><span class="quick-start-number" aria-hidden="true">04</span><h3>Keep the notes you play.</h3><ol><li>Add a named pattern containing a <code>note(…)</code> phrase to the composition.</li><li>In that pattern’s code, select the note phrase and choose <b>Play MIDI</b> below the editor. The selected pattern supplies the sound and effects.</li><li>Choose <b>Capture notes</b> and play your keyboard. Each loop becomes a take.</li><li>Choose <b>Finish</b>, preview your take, then <b>Keep take</b> to place the result in the composition as editable Strudel code.</li></ol><p class="quick-start-note">Playing the MIDI instrument tab alone does not save notes. MIDI capture keeps notes as code; Record audio input captures your microphone or interface.</p></section>
      <section id="help-mapping" tabindex="-1"><span class="quick-start-number" aria-hidden="true">05</span><h3>Give a knob a job.</h3><p><strong>Add a slider to an effect, then select the slider.</strong> For example:</p><pre><code>.lpf(slider(800, 80, 12000, 10))</code></pre><ol><li>Apply the edited pattern or input effects.</li><li>Select the inline slider and choose <b>MIDI Learn</b>.</li><li>Move the hardware knob or fader you want to bind. Then turn it again to control the effect.</li></ol><p class="quick-start-note">The four slider arguments are value, minimum, maximum, and step. Once mapped, sliders and MIDI controls update live.</p></section>
    </div>`;
  const illustrations = [
    { topic: 'inputs', file: 'connect-midi-3d', alt: 'A faceless 3D character connects a MIDI keyboard to a laptop by USB.', caption: 'Connect the keyboard. Enable MIDI. Check for incoming notes.', demo: '<div class="guide-signal"><span>MIDI keyboard</span><span class="guide-cable"><i></i></span><span>Laptop</span></div><span class="guide-connected">● MIDI input received</span>' },
    { topic: 'audio', file: 'connect-audio-3d', alt: 'A faceless 3D character connects a microphone to an audio interface linked to a laptop.', caption: 'Microphone → interface → laptop. Watch the input meter.', demo: '<div class="guide-signal"><span>Microphone</span><span>→</span><span>Interface</span><span>→</span><span>Laptop</span></div><div class="guide-levels"><span>Input</span><i></i><i></i><i></i><i></i><i></i><i></i></div>' },
    { topic: 'midi', file: 'transcribe-midi-3d', alt: 'A faceless 3D character plays a MIDI keyboard as note blocks become code on a monitor.', caption: 'Capture notes → Finish → Keep take. Your performance becomes code.', demo: '<div class="guide-notes"><span>C4</span><span>E4</span><span>G4</span><b>→</b></div><code class="guide-code">note("c4 e4 g4").s("triangle")</code>' },
  ];
  for (const illustration of illustrations) {
    const figure = document.createElement('figure'); figure.className = 'quick-start-visual';
    figure.innerHTML = `<img src="${import.meta.env.BASE_URL}help/${illustration.file}.png" alt="${illustration.alt}" width="1024" height="1024" loading="lazy"><div class="guide-demo" aria-hidden="true">${illustration.demo}</div><figcaption>${illustration.caption}</figcaption>`;
    dialog.querySelector(`#help-${illustration.topic} h3`)!.after(figure);
  }
  const browserDemo = document.createElement('figure'); browserDemo.className = 'quick-start-visual quick-start-browser';
  browserDemo.innerHTML = `<video controls muted loop playsinline preload="none" poster="${import.meta.env.BASE_URL}help/drag-pattern-browser.png" aria-label="Actual Strudel browser demonstration: cursor grabs Pattern 1, drags it down, and drops it onto Track 1"><source src="${import.meta.env.BASE_URL}help/drag-pattern-browser.webm" type="video/webm">Your browser cannot play this recording. Follow the written drag-and-drop instructions below.</video><figcaption>Grab Pattern 1, drag down to Track 1, and release to create a clip. Use fullscreen for a closer look.</figcaption>`;
  dialog.querySelector('#help-arrange h3')!.after(browserDemo);
  const video = browserDemo.querySelector('video')!;
  // Put the browser recording first, followed by the physical input illustrations.
  const sections = dialog.querySelector('.quick-start-sections')!;
  sections.prepend(dialog.querySelector('#help-arrange')!);
  sections.querySelectorAll('.quick-start-number').forEach((number, index) => { number.textContent = String(index + 1).padStart(2, '0'); });
  const navigation = dialog.querySelector('.quick-start-nav')!;
  navigation.prepend(navigation.querySelector('[href="#help-arrange"]')!);
  const slides = [...sections.querySelectorAll<HTMLElement>('section')];
  sections.setAttribute('role', 'region');
  sections.setAttribute('aria-roledescription', 'carousel');
  sections.setAttribute('aria-label', 'Quick start concepts');
  slides.forEach((slide, index) => {
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'slide');
    slide.setAttribute('aria-label', `${index + 1} of ${slides.length}: ${slide.querySelector('h3')!.textContent}`);
    const copy = document.createElement('div'); copy.className = 'quick-start-copy';
    for (const child of [...slide.children]) if (!child.matches('figure')) copy.append(child);
    slide.append(copy);
    slide.hidden = index !== 0;
  });
  const footer = document.createElement('footer'); footer.className = 'quick-start-pagination';
  footer.innerHTML = '<button type="button" data-guide-previous>← Previous</button><output role="status" aria-live="polite" aria-atomic="true" data-guide-position></output><button type="button" data-guide-next>Next →</button>';
  dialog.append(footer);
  const previous = footer.querySelector<HTMLButtonElement>('[data-guide-previous]')!;
  const next = footer.querySelector<HTMLButtonElement>('[data-guide-next]')!;
  const position = footer.querySelector<HTMLOutputElement>('[data-guide-position]')!;
  let activeIndex = 0;
  document.body.append(dialog);
  const motion = dialog.querySelector<HTMLButtonElement>('#quick-start-motion')!;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const setPaused = (paused: boolean) => {
    dialog.classList.toggle('animations-paused', paused);
    motion.setAttribute('aria-pressed', String(paused));
    motion.textContent = paused ? 'Play animations' : 'Pause animations';
    if (paused || !dialog.open || video.closest<HTMLElement>('section')!.hidden) video.pause();
    else void video.play().catch(() => { /* Native playback controls remain available. */ });
  };
  setPaused(reducedMotion.matches);
  reducedMotion.addEventListener('change', event => setPaused(event.matches));
  motion.onclick = () => setPaused(!dialog.classList.contains('animations-paused'));
  const selectSlide = (index: number, focus = false) => {
    activeIndex = Math.max(0, Math.min(slides.length - 1, index));
    slides.forEach((slide, i) => { slide.hidden = i !== activeIndex; });
    navigation.querySelectorAll<HTMLAnchorElement>('a').forEach(link => {
      if (link.hash === `#${slides[activeIndex].id}`) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
    previous.disabled = activeIndex === 0;
    next.disabled = activeIndex === slides.length - 1;
    position.textContent = `${activeIndex + 1} / ${slides.length} · ${slides[activeIndex].querySelector('h3')!.textContent}`;
    sections.scrollTop = 0;
    setPaused(dialog.classList.contains('animations-paused'));
    if (focus) slides[activeIndex].focus({ preventScroll: true });
  };
  previous.onclick = () => selectSlide(activeIndex - 1, true);
  next.onclick = () => selectSlide(activeIndex + 1, true);
  dialog.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || (event.target as HTMLElement).closest('video, input, textarea, select')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      selectSlide(activeIndex + (event.key === 'ArrowRight' ? 1 : -1), true);
    }
  });
  let returnFocus: HTMLElement | null = null;
  const open = (trigger: HTMLElement, topic?: string) => {
    returnFocus = trigger;
    dialog.showModal();
    selectSlide(topic ? slides.findIndex(slide => slide.id === `help-${topic}`) : 0, !!topic);
  };
  dialog.addEventListener('close', () => { video.pause(); returnFocus?.focus(); });
  dialog.querySelectorAll<HTMLAnchorElement>('.quick-start-nav a').forEach(link => {
    link.onclick = event => {
      event.preventDefault();
      selectSlide(slides.findIndex(slide => `#${slide.id}` === link.hash), true);
    };
  });
  selectSlide(0);
  const button = (label: string, topic?: string) => {
    const element = document.createElement('button');
    element.type = 'button'; element.textContent = label;
    element.setAttribute('aria-haspopup', 'dialog');
    element.setAttribute('aria-controls', dialog.id);
    element.onclick = () => open(element, topic);
    return element;
  };
  const help = button('Quick start'); help.id = 'quick-start-open';
  document.querySelector('#sounds-toggle')!.before(help);
  for (const [selector, label, topic] of [
    ['#audio-toolbar', 'How to record audio', 'audio'],
    ['#instrument-toolbar', 'How to record MIDI', 'midi'],
    ['.composition-toolbar', 'How to add a pattern', 'arrange'],
  ]) {
    const trigger = button(label, topic); trigger.className = 'quick-start-context';
    document.querySelector(selector)!.append(trigger);
  }
}
