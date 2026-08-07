'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { cn } from '@/lib/utils';

/**
 * ThreeDotGrid — fullscreen WebGL dot-array animation (Three.js, GLSL ES 300).
 *
 * Renders a grid of dots with varying opacities that fade in from the center
 * (intro wave) and periodically reshuffle. Designed as a decorative background
 * for auth / landing pages. Light-theme ready.
 */

interface ThreeDotGridProps {
  dotColor?: string; // hex color for dots (uniform)
  className?: string;
  children?: React.ReactNode;
}

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  const s = c.length === 3 ? c.split('').map(ch => ch + ch).join('') : c;
  const n = parseInt(s, 16);
  if (Number.isNaN(n)) return [0.2, 0.26, 0.33];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const VERTEX_SHADER = /* glsl */ `
precision mediump float;
uniform vec2 u_resolution;
out vec2 fragCoord;
void main() {
  gl_Position = vec4(position, 1.0);
  fragCoord = (position.xy + 1.0) * 0.5 * u_resolution;
  fragCoord.y = u_resolution.y - fragCoord.y;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
precision mediump float;
in vec2 fragCoord;

uniform float u_time;
uniform float u_opacities[10];
uniform vec3 u_colors[6];
uniform float u_total_size;
uniform float u_dot_size;
uniform vec2 u_resolution;

out vec4 fragColor;

float PHI = 1.61803398874989484820459;
float random(vec2 xy) {
  return fract(tan(distance(xy * PHI, xy) * 0.5) * xy.x);
}

void main() {
  vec2 st = fragCoord.xy;
  st.x -= abs(floor((mod(u_resolution.x, u_total_size) - u_dot_size) * 0.5));
  st.y -= abs(floor((mod(u_resolution.y, u_total_size) - u_dot_size) * 0.5));

  float opacity = step(0.0, st.x) * step(0.0, st.y);

  vec2 st2 = vec2(floor(st.x / u_total_size), floor(st.y / u_total_size));

  float frequency = 5.0;
  float show_offset = random(st2);
  int colorIdx = int(show_offset * 6.0);
  vec3 color = u_colors[colorIdx];

  float rand_val = random(st2 * floor((u_time / frequency) + show_offset + frequency));
  int rand = int(rand_val * 10.0);
  opacity *= u_opacities[rand];

  opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.x / u_total_size));
  opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.y / u_total_size));

  float animation_speed_factor = 3.0;
  vec2 center_grid = u_resolution / 2.0 / u_total_size;
  float dist_from_center = distance(center_grid, st2);

  float timing_offset_intro = dist_from_center * 0.01 + (random(st2) * 0.15);
  float current_timing_offset = timing_offset_intro;

  opacity *= step(current_timing_offset, u_time * animation_speed_factor);
  opacity *= clamp(
    (1.0 - step(current_timing_offset + 0.1, u_time * animation_speed_factor)) * 1.25,
    1.0,
    1.25
  );

  // Premultiplied alpha — the renderer blends with One / OneMinusSrcAlpha.
  fragColor = vec4(color * opacity, opacity);
}
`;

export function ThreeDotGrid({
  dotColor = '#334155',
  className,
  children,
}: ThreeDotGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const [r, g, b] = hexToRgb(dotColor);
    const dotVec = new THREE.Vector3(r, g, b);
    const uniforms = {
      u_time: { value: 0 },
      u_resolution: {
        value: new THREE.Vector2(window.innerWidth * 2, window.innerHeight * 2),
      },
      u_opacities: { value: [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1.0] },
      u_colors: { value: Array.from({ length: 6 }, () => dotVec.clone()) },
      u_total_size: { value: 20.0 },
      u_dot_size: { value: 6.0 },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms,
      glslVersion: THREE.GLSL3,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      transparent: true,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    scene.add(new THREE.Mesh(geometry, material));

    let animationId = 0;
    const startTime = performance.now();
    const animate = () => {
      if (!active) return;
      animationId = requestAnimationFrame(animate);
      uniforms.u_time.value = (performance.now() - startTime) / 1000.0;
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!active) return;
      renderer.setSize(window.innerWidth, window.innerHeight);
      uniforms.u_resolution.value.set(
        window.innerWidth * 2,
        window.innerHeight * 2
      );
    };
    window.addEventListener('resize', handleResize);

    return () => {
      active = false;
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
    };
  }, [dotColor]);

  return (
    <div
      className={cn(
        'relative flex min-h-screen items-center justify-center overflow-hidden bg-background',
        className
      )}
    >
      <canvas ref={canvasRef} className="absolute inset-0 z-0 block" />
      <div className="relative z-10 flex w-full items-center justify-center px-4 py-8">
        {children}
      </div>
    </div>
  );
}
