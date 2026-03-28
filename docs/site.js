const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function attachHeroParallax() {
  if (prefersReducedMotion.matches) {
    return;
  }

  const scene = document.querySelector('.hero-scene');
  if (!scene) {
    return;
  }

  const app = scene.querySelector('.scene-app');
  const glowA = scene.querySelector('.scene-glow-a');
  const glowB = scene.querySelector('.scene-glow-b');
  const cardA = scene.querySelector('.floating-card-a');
  const cardB = scene.querySelector('.floating-card-b');

  if (!app) {
    return;
  }

  let pointerX = 0;
  let pointerY = 0;
  let pointerActive = false;

  const render = (time) => {
    const driftX = Math.sin(time / 1800) * 0.32;
    const driftY = Math.cos(time / 2200) * 0.22;
    const activeX = pointerActive ? pointerX : 0;
    const activeY = pointerActive ? pointerY : 0;

    const targetX = driftX + activeX * 0.75;
    const targetY = driftY + activeY * 0.75;

    const rotateY = -8 + targetX * 8;
    const rotateX = 5 - targetY * 7;
    const shiftX = targetX * 16;
    const shiftY = targetY * 14;

    app.style.transform =
      `perspective(1400px) translate3d(${shiftX}px, ${shiftY}px, 0) rotateY(${rotateY}deg) rotateX(${rotateX}deg)`;

    if (cardA) {
      cardA.style.translate = `${targetX * -18}px ${targetY * -16}px`;
    }

    if (cardB) {
      cardB.style.translate = `${targetX * 22}px ${targetY * 18}px`;
    }

    if (glowA) {
      glowA.style.translate = `${targetX * 18}px ${targetY * 12}px`;
    }

    if (glowB) {
      glowB.style.translate = `${targetX * -16}px ${targetY * -10}px`;
    }

    requestAnimationFrame(render);
  };

  scene.addEventListener('pointermove', (event) => {
    const rect = scene.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    pointerX = (x - 0.5) * 2;
    pointerY = (y - 0.5) * 2;
    pointerActive = true;
  });

  scene.addEventListener('pointerleave', () => {
    pointerActive = false;
    pointerX = 0;
    pointerY = 0;
  });

  requestAnimationFrame(render);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachHeroParallax, { once: true });
} else {
  attachHeroParallax();
}
