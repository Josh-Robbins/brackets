const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const isMobileViewport = window.matchMedia('(max-width: 780px)');
const isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

function attachHeroParallax() {
  if (prefersReducedMotion.matches || isMobileViewport.matches || !isFinePointer.matches) {
    return;
  }

  const scene = document.querySelector('.hero-scene');
  if (!scene) {
    return;
  }

  const app = scene.querySelector('.scene-app');
  const windowFrame = scene.querySelector('.scene-window');
  const cards = [...scene.querySelectorAll('.scene-card')];
  const glowA = scene.querySelector('.scene-glow-a');
  const glowB = scene.querySelector('.scene-glow-b');
  const cardA = scene.querySelector('.floating-card-a');
  const cardB = scene.querySelector('.floating-card-b');

  if (!app) {
    return;
  }

  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let pointerActive = false;
  let sceneVisible = true;
  let frameId = 0;

  const setPointerFromEvent = (event) => {
    const rect = scene.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    targetX = Math.max(-1, Math.min(1, (x - 0.5) * 2));
    targetY = Math.max(-1, Math.min(1, (y - 0.5) * 2));
    pointerActive = true;
    ensureRunning();
  };

  const clearPointer = () => {
    pointerActive = false;
  };

  const paint = (time) => {
    frameId = 0;

    if (document.hidden || !sceneVisible) {
      return;
    }

    const driftX = Math.sin(time / 2100) * 0.12;
    const driftY = Math.cos(time / 2600) * 0.08;

    const desiredX = (pointerActive ? targetX * 0.95 : 0) + driftX;
    const desiredY = (pointerActive ? targetY * 0.85 : 0) + driftY;

    currentX += (desiredX - currentX) * 0.09;
    currentY += (desiredY - currentY) * 0.09;

    const appRotateY = -8 + currentX * 11;
    const appRotateX = 5 - currentY * 9;
    const appShiftX = currentX * 18;
    const appShiftY = currentY * 15;

    app.style.transform =
      `perspective(1400px) translate3d(${appShiftX}px, ${appShiftY}px, 0) rotateY(${appRotateY}deg) rotateX(${appRotateX}deg)`;

    if (windowFrame) {
      windowFrame.style.transform = `translate3d(${currentX * -5}px, ${currentY * -5}px, 14px)`;
    }

    cards.forEach((card, index) => {
      const depth = 8 + index * 4;
      const shift = 3 + index * 1.25;
      card.style.transform = `translate3d(${currentX * shift}px, ${currentY * shift}px, ${depth}px)`;
    });

    if (cardA) {
      cardA.style.translate = `${currentX * -18}px ${currentY * -16}px`;
    }

    if (cardB) {
      cardB.style.translate = `${currentX * 20}px ${currentY * 18}px`;
    }

    if (glowA) {
      glowA.style.translate = `${currentX * 18}px ${currentY * 12}px`;
    }

    if (glowB) {
      glowB.style.translate = `${currentX * -15}px ${currentY * -12}px`;
    }

    const stillMoving =
      pointerActive ||
      Math.abs(desiredX - currentX) > 0.002 ||
      Math.abs(desiredY - currentY) > 0.002 ||
      Math.abs(driftX) > 0.001 ||
      Math.abs(driftY) > 0.001;

    if (stillMoving) {
      frameId = requestAnimationFrame(paint);
    }
  };

  const ensureRunning = () => {
    if (!frameId && !document.hidden && sceneVisible) {
      frameId = requestAnimationFrame(paint);
    }
  };

  const observer = new IntersectionObserver((entries) => {
    sceneVisible = entries.some((entry) => entry.isIntersecting);
    if (sceneVisible) {
      ensureRunning();
    }
  }, { threshold: 0.15 });

  observer.observe(scene);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      ensureRunning();
    }
  });

  scene.addEventListener('pointerenter', setPointerFromEvent);
  scene.addEventListener('pointermove', setPointerFromEvent);
  scene.addEventListener('pointerleave', () => {
    clearPointer();
    ensureRunning();
  });

  ensureRunning();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachHeroParallax, { once: true });
} else {
  attachHeroParallax();
}
