import { ImageResponse } from 'next/og';

export const size = {
  width: 512,
  height: 512,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(180deg, #d94d29 0%, #b82f11 100%)',
          color: 'white',
          fontSize: 220,
          fontWeight: 800,
          letterSpacing: '-0.08em',
        }}
      >
        P
      </div>
    ),
    size,
  );
}
