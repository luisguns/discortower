interface BrandMarkProps {
  className?: string
}

export const BrandMark = ({ className = '' }: BrandMarkProps) => (
  <span className={`brand__mark ${className}`.trim()} aria-hidden="true">
    <svg viewBox="0 0 48 48">
      <path
        className="brand-mark__shell"
        d="M10 2h31a5 5 0 0 1 5 5v31l-7 8H7a5 5 0 0 1-5-5V10l8-8Z"
      />
      <path
        className="brand-mark__car"
        d="m8.5 29.1 3.9-9.2a5 5 0 0 1 4.6-3h14a5 5 0 0 1 4.6 3l3.9 9.2 2.5 2v7.4a2.5 2.5 0 0 1-2.5 2.5H37v2.2h-5V41H16v2.2h-5V41H8.5A2.5 2.5 0 0 1 6 38.5v-7.4l2.5-2Z"
      />
      <path className="brand-mark__glass" d="m16.5 20.5-3 7.2h21l-3-7.2a1.6 1.6 0 0 0-1.5-1H18a1.6 1.6 0 0 0-1.5 1Z" />
      <path
        className="brand-mark__call"
        d="M13.7 22.8c6.1-4.1 14.5-4.1 20.6 0l-3.2 4-4.4-1.9a6.8 6.8 0 0 0-5.4 0l-4.4 1.9-3.2-4Z"
      />
      <path className="brand-mark__signal" d="M32.5 7.8a10 10 0 0 1 6.2 9M32.2 11.6a6 6 0 0 1 2.8 4.8" />
      <path className="brand-mark__grille" d="M18 33.5h12v2H18z" />
      <path className="brand-mark__lamp" d="M9.7 32h5.8l-1.1 3H9.7zM32.5 32h5.8v3h-4.7z" />
    </svg>
  </span>
)
