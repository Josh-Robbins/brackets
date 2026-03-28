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

  let raf = 0;
  let targetX = 0;
  let targetY = 0;

  const paint = () => {
    raf = 0;

    const rotateY = -8 + targetX * 7;
    const rotateX = 5 - targetY * 6;
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
  };

  const schedule = () => {
    if (!raf) {
      raf = requestAnimationFrame(paint);
    }
  };

  scene.addEventListener('pointermove', (event) => {
    const rect = scene.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    targetX = (x - 0.5) * 2;
    targetY = (y - 0.5) * 2;
    schedule();
  });

  scene.addEventListener('pointerleave', () => {
    targetX = 0;
    targetY = 0;
    schedule();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachHeroParallax, { once: true });
} else {
  attachHeroParallax();
}
