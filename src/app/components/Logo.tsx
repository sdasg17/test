import React from 'react';

/**
 * BellWeather mark.
 *
 * Two strokes meeting at the peak: the cold tail falling left, the heat tail
 * falling right. A distribution and a weather front at once, and the two
 * colours are the same ones the tool uses for the two perils everywhere else.
 *
 * The viewBox is padded beyond the path bounds so the round stroke caps are
 * not clipped at heavier weights, and the stroke weight is a prop because a
 * 7-unit stroke that reads well at 486px disappears at 26px.
 */
export const Logo: React.FC<{
  size?: number;
  weight?: number;
  title?: string;
}> = ({ size = 26, weight = 30, title }) => (
  <svg
    height={size}
    width={size * 1.32}
    viewBox="-22 -22 530 412"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role={title ? 'img' : 'presentation'}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    style={{ display: 'block', flexShrink: 0 }}
  >
    <path
      d="M3.5 364.505C180.501 356.505 139 2.00481 247.5 3.50481"
      stroke="var(--cold, #4D9DE0)"
      strokeWidth={weight}
      strokeLinecap="round"
    />
    <path
      d="M247.5 3.50482C356 5.00482 305.001 336.005 482 364.505"
      stroke="var(--heat, #E05A3C)"
      strokeWidth={weight}
      strokeLinecap="round"
    />
  </svg>
);
