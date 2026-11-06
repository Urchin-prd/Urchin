import railwayPng from '../assets/railway.png';

/** Brand marks for integrations, drawn as simple tiles so they sit well on the dark UI. */

export function TelegramLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Telegram">
      <circle cx="16" cy="16" r="16" fill="#229ED9" />
      <path d="M7.2 15.6l15.4-6c.7-.3 1.4.2 1.1 1.3l-2.6 12.2c-.2.9-.7 1.1-1.5.7l-4-3-1.9 1.9c-.2.2-.4.4-.8.4l.3-4.1 7.4-6.7c.3-.3-.1-.4-.5-.2l-9.2 5.8-3.9-1.2c-.9-.3-.9-.9.2-1.3z" fill="#fff" />
    </svg>
  );
}

/** The official Railway mark (white on transparent, from lobe-icons, MIT), on a dark tile. */
export function RailwayLogo({ size = 32 }: { size?: number }) {
  return (
    <span className="logo-tile" style={{ width: size, height: size }}>
      <img src={railwayPng} alt="Railway" width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} />
    </span>
  );
}
