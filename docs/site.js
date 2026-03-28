const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const isMobileViewport = window.matchMedia('(max-width: 780px)');

function attachHeroParallax() {
  if (prefersReducedMotion.matches || isMobileViewport.matches) {
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

  const setPointerFromEvent = (event) => {
    const rect = scene.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    targetX = Math.max(-1, Math.min(1, (x - 0.5) * 2));
    targetY = Math.max(-1, Math.min(1, (y - 0.5) * 2));
    pointerActive = true;
  };

  const clearPointer = () => {
    pointerActive = false;
  };

  const render = (time) => {
    const driftX = Math.sin(time / 1700) * 0.18;
    const driftY = Math.cos(time / 2100) * 0.12;

    const desiredX = (pointerActive ? targetX * 0.9 : 0) + driftX;
    const desiredY = (pointerActive ? targetY * 0.8 : 0) + driftY;

    currentX += (desiredX - currentX) * 0.08;
    currentY += (desiredY - currentY) * 0.08;

    const appRotateY = -8 + currentX * 12;
    const appRotateX = 5 - currentY * 10;
    const appShiftX = currentX * 22;
    const appShiftY = currentY * 18;

    app.style.transform =
      `perspective(1400px) translate3d(${appShiftX}px, ${appShiftY}px, 0) rotateY(${appRotateY}deg) rotateX(${appRotateX}deg)`;

    if (windowFrame) {
      windowFrame.style.transform =
        `translate3d(${currentX * -6}px, ${currentY * -6}px, 14px)`;
    }

    cards.forEach((card, index) => {
      const depth = 8 + index * 4;
      const shift = 4 + index * 1.5;
      card.style.transform =
        `translate3d(${currentX * shift}px, ${currentY * shift}px, ${depth}px)`;
    });

    if (cardA) {
      cardA.style.translate = `${currentX * -26}px ${currentY * -24}px`;
    }

    if (cardB) {
      cardB.style.translate = `${currentX * 30}px ${currentY * 26}px`;
    }

    if (glowA) {
      glowA.style.translate = `${currentX * 30}px ${currentY * 20}px`;
    }

    if (glowB) {
      glowB.style.translate = `${currentX * -24}px ${currentY * -18}px`;
    }

    requestAnimationFrame(render);
  };

  scene.addEventListener('pointerenter', setPointerFromEvent);
  scene.addEventListener('pointermove', setPointerFromEvent);
  scene.addEventListener('pointerleave', clearPointer);

  requestAnimationFrame(render);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachHeroParallax, { once: true });
} else {
  attachHeroParallax();
}
