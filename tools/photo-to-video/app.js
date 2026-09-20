/* ==========================================================================
   Photo to Video — an animated Ken Burns slideshow maker, fully
   self-contained (see tools/STANDARDS.md). Everything runs in the
   browser: nothing is uploaded, nothing is fetched. Export uses
   canvas.captureStream() + MediaRecorder — the only realistic way to
   produce an actual video file with no backend and no library; it
   necessarily renders in real time (see the note in the UI).
   ========================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var els = {
    addPhotos: $("pv-add-photos"),
    fileInput: $("pv-file-input"),
    emptyNote: $("pv-empty-note"),
    slidesList: $("pv-slides"),
    motionField: $("pv-motion-field"),
    duration: $("pv-duration"),
    durationVal: $("pv-duration-val"),
    transition: $("pv-transition"),
    transitionVal: $("pv-transition-val"),
    render: $("pv-render"),
    renderStatus: $("pv-render-status"),
    canvas: $("pv-canvas"),
    play: $("pv-play"),
    scrub: $("pv-scrub"),
    time: $("pv-time"),
    addAudio: $("pv-add-audio"),
    audioInput: $("pv-audio-input"),
    audioPanel: $("pv-audio-panel"),
    audioName: $("pv-audio-name"),
    audioStart: $("pv-audio-start"),
    audioStartVal: $("pv-audio-start-val"),
    audioEnd: $("pv-audio-end"),
    audioEndVal: $("pv-audio-end-val"),
    audioVolume: $("pv-audio-volume"),
    audioVolumeVal: $("pv-audio-volume-val"),
    audioRemove: $("pv-audio-remove")
  };

  var ctx = els.canvas.getContext("2d");
  var DOC_W = els.canvas.width, DOC_H = els.canvas.height;

  var state = { duration: 3, transition: 0.6 };

  /* ------------------------------------------------------------------
     Audio — one <audio> element, loaded once, kept in lockstep with the
     video timeline (audio time = trimStart + video elapsed) rather than
     just "played alongside it", so scrubbing the video also scrubs the
     audio and a paused video means silence, not a soundtrack still
     running underneath. The Web Audio graph (source -> destination) is
     built once at load time, since createMediaElementSource throws if
     called twice on the same element — reused for every export.
     ------------------------------------------------------------------ */
  var audio = null; /* { el, name, duration, trimStart, trimEnd, volume, audioCtx, destNode } */
  var slides = [];
  var activeSlideId = null;
  var slideSeq = 0;

  var UP_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
  var DOWN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>';
  var TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';

  var MOTION_LABELS = {
    "zoom-in": "Zoom In", "zoom-out": "Zoom Out", "pan-lr": "Pan →",
    "pan-rl": "Pan ←", "pan-ud": "Pan ↓", "static": "Static"
  };

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function activeSlide() {
    return slides.filter(function (s) { return s.id === activeSlideId; })[0] || null;
  }

  function totalDuration() {
    return slides.length * state.duration;
  }

  /* ------------------------------------------------------------------
     Slides list
     ------------------------------------------------------------------ */
  function renderSlides() {
    els.emptyNote.hidden = slides.length > 0;
    els.motionField.hidden = !activeSlide();
    els.play.disabled = slides.length === 0;
    els.scrub.disabled = slides.length === 0;
    els.render.disabled = slides.length === 0;

    els.slidesList.innerHTML = slides.map(function (slide, i) {
      return '<div class="pv-slide' + (slide.id === activeSlideId ? " is-active" : "") + '" data-slide-select="' + slide.id + '">' +
        '<div class="pv-slide-thumb"><img src="' + slide.img.src + '" alt=""></div>' +
        '<div class="pv-slide-body">' +
          '<span class="pv-slide-name">' + escapeHtml(slide.name) + "</span>" +
          '<span class="pv-slide-motion">' + MOTION_LABELS[slide.motion] + "</span>" +
        "</div>" +
        '<div class="pv-slide-actions">' +
          '<button type="button" class="pv-slide-btn" data-slide-up="' + slide.id + '" title="Move earlier"' + (i === 0 ? " disabled" : "") + ">" + UP_ICON + "</button>" +
          '<button type="button" class="pv-slide-btn" data-slide-down="' + slide.id + '" title="Move later"' + (i === slides.length - 1 ? " disabled" : "") + ">" + DOWN_ICON + "</button>" +
          '<button type="button" class="pv-slide-btn" data-slide-delete="' + slide.id + '" title="Remove">' + TRASH_ICON + "</button>" +
        "</div>" +
      "</div>";
    }).join("");

    syncMotionButtons();
    if (!playing) drawCurrentFrame();
  }

  function syncMotionButtons() {
    var slide = activeSlide();
    $$("[data-choice='motion'] .pv-choice-card").forEach(function (card) {
      card.classList.toggle("is-active", !!slide && card.getAttribute("data-value") === slide.motion);
    });
  }

  function moveSlide(id, direction) {
    var index = slides.findIndex(function (s) { return s.id === id; });
    var swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= slides.length) return;
    var temp = slides[index];
    slides[index] = slides[swapIndex];
    slides[swapIndex] = temp;
    renderSlides();
  }

  function deleteSlide(id) {
    slides = slides.filter(function (s) { return s.id !== id; });
    if (activeSlideId === id) activeSlideId = slides.length ? slides[0].id : null;
    renderSlides();
  }

  els.slidesList.addEventListener("click", function (event) {
    var target;
    if ((target = event.target.closest("[data-slide-up]"))) { moveSlide(target.getAttribute("data-slide-up"), -1); return; }
    if ((target = event.target.closest("[data-slide-down]"))) { moveSlide(target.getAttribute("data-slide-down"), 1); return; }
    if ((target = event.target.closest("[data-slide-delete]"))) { deleteSlide(target.getAttribute("data-slide-delete")); return; }
    if ((target = event.target.closest("[data-slide-select]"))) {
      activeSlideId = target.getAttribute("data-slide-select");
      renderSlides();
    }
  });

  $$("[data-choice='motion'] .pv-choice-card").forEach(function (card) {
    card.addEventListener("click", function () {
      var slide = activeSlide();
      if (!slide) return;
      slide.motion = card.getAttribute("data-value");
      renderSlides();
    });
  });

  /* ------------------------------------------------------------------
     Loading photos
     ------------------------------------------------------------------ */
  els.addPhotos.addEventListener("click", function () { els.fileInput.click(); });

  els.fileInput.addEventListener("change", function () {
    var files = Array.prototype.slice.call(els.fileInput.files || []);
    files.forEach(function (file) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          slideSeq++;
          var slide = { id: "slide-" + slideSeq, name: file.name.replace(/\.[a-z0-9]+$/i, ""), img: img, motion: pickDefaultMotion(slideSeq) };
          slides.push(slide);
          activeSlideId = slide.id;
          renderSlides();
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
    els.fileInput.value = "";
  });

  /** Alternates a couple of tasteful defaults rather than leaving every
      new slide "Static" — most of the time a Ken Burns effect is exactly
      what someone reaches for this tool wanting. */
  function pickDefaultMotion(seq) {
    var cycle = ["zoom-in", "pan-lr", "zoom-out", "pan-rl"];
    return cycle[(seq - 1) % cycle.length];
  }

  /* ------------------------------------------------------------------
     Timing controls
     ------------------------------------------------------------------ */
  els.duration.addEventListener("input", function () {
    state.duration = parseFloat(els.duration.value);
    els.durationVal.textContent = state.duration.toFixed(1) + "s";
    renderSlides();
  });
  els.transition.addEventListener("input", function () {
    state.transition = parseFloat(els.transition.value);
    els.transitionVal.textContent = state.transition.toFixed(1) + "s";
  });

  /* ------------------------------------------------------------------
     Ken Burns math — one function, shared by preview and export, so
     they can never draw two different things.
     ------------------------------------------------------------------ */
  function motionRect(motion, progress) {
    /* Every motion starts from a "cover" fit (like CSS object-fit:cover
       at zoom 1) so the photo always fills the frame with no letterbox,
       then adds an animated zoom/pan on top of that baseline. */
    var zoom = 1, panX = 0.5, panY = 0.5;
    switch (motion) {
      case "zoom-in": zoom = 1 + 0.18 * progress; break;
      case "zoom-out": zoom = 1.18 - 0.18 * progress; break;
      case "pan-lr": zoom = 1.15; panX = progress; break;
      case "pan-rl": zoom = 1.15; panX = 1 - progress; break;
      case "pan-ud": zoom = 1.15; panY = progress; break;
      default: zoom = 1; break;
    }
    return { zoom: zoom, panX: panX, panY: panY };
  }

  function drawSlideImage(context, img, motion, progress, alpha) {
    var base = Math.max(DOC_W / img.width, DOC_H / img.height);
    var m = motionRect(motion, progress);
    var scale = base * m.zoom;
    var w = img.width * scale, h = img.height * scale;
    var x = -(w - DOC_W) * m.panX;
    var y = -(h - DOC_H) * m.panY;
    context.globalAlpha = alpha;
    context.drawImage(img, x, y, w, h);
    context.globalAlpha = 1;
  }

  /** The one frame-drawing routine — used by the live preview loop, the
      scrub-bar single-frame redraw, and the real-time export loop. A
      time `t` in seconds since the start of the whole sequence maps to
      exactly one visual state; nothing else computes this separately. */
  function drawFrame(context, t) {
    context.clearRect(0, 0, DOC_W, DOC_H);
    if (!slides.length) return;

    var dur = state.duration;
    var trans = Math.min(state.transition, dur * 0.9);
    var total = totalDuration();
    t = Math.max(0, Math.min(t, total - 0.0001));

    var index = Math.min(slides.length - 1, Math.floor(t / dur));
    var local = t - index * dur;
    var slide = slides[index];

    drawSlideImage(context, slide.img, slide.motion, local / dur, 1);

    var next = slides[index + 1];
    if (next && trans > 0 && local > dur - trans) {
      var fade = (local - (dur - trans)) / trans;
      drawSlideImage(context, next.img, next.motion, 0, fade);
    }
  }

  function drawCurrentFrame() {
    drawFrame(ctx, lastElapsed);
    updateTransport(lastElapsed);
  }

  function updateTransport(elapsed) {
    var total = totalDuration();
    els.time.textContent = elapsed.toFixed(1) + "s / " + total.toFixed(1) + "s";
    if (!scrubbing) els.scrub.value = total > 0 ? Math.round((elapsed / total) * 1000) : 0;
  }

  /* ------------------------------------------------------------------
     Preview playback
     ------------------------------------------------------------------ */
  var playing = false;
  var playStartedAt = 0;
  var lastElapsed = 0;
  var scrubbing = false;

  /** Keeps the audio element's position locked to the video timeline:
      video time `elapsed` always corresponds to audio time
      `trimStart + elapsed`. Pausing happens automatically once that
      would run past trimEnd, even if the video keeps going. */
  function syncAudio(elapsed, shouldPlay) {
    if (!audio) return;
    var target = audio.trimStart + elapsed;
    if (target >= audio.trimEnd) {
      audio.el.pause();
      return;
    }
    if (Math.abs(audio.el.currentTime - target) > 0.15) audio.el.currentTime = target;
    if (shouldPlay && audio.el.paused) audio.el.play().catch(function () {});
    if (!shouldPlay && !audio.el.paused) audio.el.pause();
  }

  function tick(now) {
    if (!playing) return;
    var total = totalDuration();
    lastElapsed = (now - playStartedAt) / 1000;
    if (lastElapsed >= total) {
      lastElapsed = total;
      drawFrame(ctx, lastElapsed);
      updateTransport(lastElapsed);
      stopPlayback();
      return;
    }
    drawFrame(ctx, lastElapsed);
    updateTransport(lastElapsed);
    syncAudio(lastElapsed, true);
    requestAnimationFrame(tick);
  }

  function startPlayback() {
    if (!slides.length) return;
    if (lastElapsed >= totalDuration()) lastElapsed = 0;
    playing = true;
    playStartedAt = performance.now() - lastElapsed * 1000;
    els.play.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>';
    syncAudio(lastElapsed, true);
    requestAnimationFrame(tick);
  }

  function stopPlayback() {
    playing = false;
    els.play.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    syncAudio(lastElapsed, false);
  }

  els.play.addEventListener("click", function () {
    if (playing) stopPlayback();
    else startPlayback();
  });

  els.scrub.addEventListener("input", function () {
    scrubbing = true;
    stopPlayback();
    var total = totalDuration();
    lastElapsed = (parseInt(els.scrub.value, 10) / 1000) * total;
    drawFrame(ctx, lastElapsed);
    updateTransport(lastElapsed);
    syncAudio(lastElapsed, false);
  });
  els.scrub.addEventListener("change", function () { scrubbing = false; });

  /* ------------------------------------------------------------------
     Loading audio
     ------------------------------------------------------------------ */
  els.addAudio.addEventListener("click", function () { els.audioInput.click(); });

  els.audioInput.addEventListener("change", function () {
    var file = els.audioInput.files && els.audioInput.files[0];
    if (!file) return;

    if (audio) { audio.el.pause(); URL.revokeObjectURL(audio.el.src); audio.el.remove(); }

    var el = new Audio();
    el.src = URL.createObjectURL(file);
    el.preload = "auto";
    /* Attached to the document (hidden) rather than left detached — some
       browsers are less predictable about playback/autoplay policy on a
       MediaElement that was never inserted into the page. */
    el.hidden = true;
    document.body.appendChild(el);
    el.onloadedmetadata = function () {
      audio = {
        el: el,
        name: file.name,
        duration: el.duration,
        trimStart: 0,
        trimEnd: el.duration,
        volume: 1,
        audioCtx: null,
        destNode: null
      };
      el.volume = 1;

      els.audioPanel.hidden = false;
      els.audioName.textContent = file.name + " (" + el.duration.toFixed(1) + "s)";
      els.audioStart.max = String(el.duration);
      els.audioStart.value = "0";
      els.audioEnd.max = String(el.duration);
      els.audioEnd.value = String(el.duration);
      els.audioStartVal.textContent = "0.0s";
      els.audioEndVal.textContent = el.duration.toFixed(1) + "s";
    };
    els.audioInput.value = "";
  });

  els.audioStart.addEventListener("input", function () {
    if (!audio) return;
    var value = Math.min(parseFloat(els.audioStart.value), audio.trimEnd - 0.1);
    audio.trimStart = value;
    els.audioStartVal.textContent = value.toFixed(1) + "s";
  });

  els.audioEnd.addEventListener("input", function () {
    if (!audio) return;
    var value = Math.max(parseFloat(els.audioEnd.value), audio.trimStart + 0.1);
    audio.trimEnd = value;
    els.audioEndVal.textContent = value.toFixed(1) + "s";
  });

  els.audioVolume.addEventListener("input", function () {
    if (!audio) return;
    audio.volume = parseInt(els.audioVolume.value, 10) / 100;
    audio.el.volume = audio.volume;
    els.audioVolumeVal.textContent = els.audioVolume.value + "%";
  });

  els.audioRemove.addEventListener("click", function () {
    if (!audio) return;
    audio.el.pause();
    URL.revokeObjectURL(audio.el.src);
    audio.el.remove();
    audio = null;
    els.audioPanel.hidden = true;
  });

  /* ------------------------------------------------------------------
     Export — canvas.captureStream() + MediaRecorder. This necessarily
     runs in real time: there is no client-side way to render a video
     faster than playback without WebCodecs-level machinery, which is
     out of scope for a dependency-free tool. Reuses drawFrame exactly
     as the preview does, so what renders is what you already previewed.
     Audio, if any, is mixed in via a Web Audio graph feeding a second
     track on the same MediaStream the recorder captures.
     ------------------------------------------------------------------ */
  function pickMimeType() {
    var candidates = [
      "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
    }
    return "";
  }

  /** Built once per loaded audio file and reused for every render —
      createMediaElementSource throws if called a second time on the
      same <audio> element. Also connects to the real speakers (not just
      the recorder's destination) so audio is audible during the render,
      not just present in the resulting file. */
  function getAudioTrack() {
    if (!audio) return null;
    if (!audio.destNode) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      audio.audioCtx = new Ctx();
      var source = audio.audioCtx.createMediaElementSource(audio.el);
      audio.destNode = audio.audioCtx.createMediaStreamDestination();
      source.connect(audio.destNode);
      source.connect(audio.audioCtx.destination);
    }
    return audio.destNode.stream.getAudioTracks()[0] || null;
  }

  els.render.addEventListener("click", function () {
    if (!slides.length || !window.MediaRecorder) {
      els.renderStatus.hidden = false;
      els.renderStatus.textContent = window.MediaRecorder ? "Add at least one photo first." : "This browser doesn't support MediaRecorder — try a recent Chrome, Edge or Firefox.";
      return;
    }

    stopPlayback();
    var total = totalDuration();
    var mimeType = pickMimeType();

    var tracks = els.canvas.captureStream(30).getVideoTracks();
    var audioTrack = getAudioTrack();
    if (audioTrack) tracks.push(audioTrack);
    var stream = new MediaStream(tracks);

    var recorder = mimeType ? new MediaRecorder(stream, { mimeType: mimeType }) : new MediaRecorder(stream);
    var chunks = [];

    recorder.ondataavailable = function (event) { if (event.data && event.data.size) chunks.push(event.data); };
    recorder.onstop = function () {
      if (audio) audio.el.pause();
      var blob = new Blob(chunks, { type: "video/webm" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "slideshow.webm";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

      els.render.disabled = false;
      els.render.textContent = "";
      els.render.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>Render Video (WebM)';
      els.renderStatus.textContent = "Done — check your downloads.";
    };

    els.render.disabled = true;
    els.render.textContent = "Rendering…";
    els.renderStatus.hidden = false;

    recorder.start();
    var startedAt = performance.now();
    if (audio) { audio.el.currentTime = audio.trimStart; audio.el.play().catch(function () {}); }

    function renderTick(now) {
      var elapsed = (now - startedAt) / 1000;
      if (elapsed >= total) {
        drawFrame(ctx, total - 0.001);
        recorder.stop();
        return;
      }
      drawFrame(ctx, elapsed);
      syncAudio(elapsed, true);
      els.renderStatus.textContent = "Rendering… " + elapsed.toFixed(1) + "s / " + total.toFixed(1) + "s";
      requestAnimationFrame(renderTick);
    }
    requestAnimationFrame(renderTick);
  });

  renderSlides();
  updateTransport(0);
})();
