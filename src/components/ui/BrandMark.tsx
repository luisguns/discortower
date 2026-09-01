interface BrandMarkProps {
  className?: string
}

export const BrandMark = ({ className = '' }: BrandMarkProps) => (
  <span className={`brand__mark ${className}`.trim()} aria-hidden="true">
    <svg viewBox="0 0 48 48">
      <rect className="brand-mark__plate" x="3" y="3" width="42" height="42" rx="14" />
      <path className="brand-mark__spot" d="M24 8.5c-8.6 0-15.5 6.4-15.5 14.4 0 10.2 12.2 17.2 14.7 18.5.5.3 1.1.3 1.6 0 2.5-1.3 14.7-8.3 14.7-18.5C39.5 14.9 32.6 8.5 24 8.5Z" />
      <path className="brand-mark__controller" d="M15.8 18.5a5.5 5.5 0 0 1 5.3-4h5.8a5.5 5.5 0 0 1 5.3 4l2.1 7.1a3.3 3.3 0 0 1-5.4 3.2L27.4 27h-6.8l-1.5 1.8a3.3 3.3 0 0 1-5.4-3.2l2.1-7.1Z" />
      <path className="brand-mark__control" d="M20 19v5M17.5 21.5h5" />
      <path className="brand-mark__play" d="m27 18.7 4.7 2.8-4.7 2.8Z" />
      <circle className="brand-mark__spark" cx="36.5" cy="11.5" r="4.5" />
    </svg>
  </span>
)
