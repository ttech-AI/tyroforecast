type TyroMarkProps = {
  size?: number
  /**
   * - `default`: orange + multi-blue palette (sidebar, top nav)
   * - `solid`:   all-blue variant — for use on light backgrounds
   * - `white`:   monochrome white with opacity variation — for use on dark/colored bg
   */
  variant?: 'default' | 'solid' | 'white'
}

export function TyroMark({ size = 28, variant = 'default' }: TyroMarkProps) {
  const isSolid = variant === 'solid'
  const isWhite = variant === 'white'

  if (isWhite) {
    return (
      <svg
        viewBox="0 0 150 150"
        width={size}
        height={size}
        className="shrink-0"
        aria-hidden="true"
      >
        <path
          fill="#fff"
          d="M14.52,68.93v33.41s-.28,6.49,3.59,4.28c10.49-6.21,21.95-12.7,26.51-15.05,9.39-4.69,8.01-10.49,8.01-10.49V48.77c0-8.42-5.8-4.69-5.8-4.69l-28.16,16.15s-4.14,2.35-4.14,8.7Z"
        />
        <path
          fill="#fff"
          fillOpacity="0.7"
          d="M97.77,70.17v40.31s1.52,10.91-7.45,15.88l-25.68,15.19s-6.9,3.31-6.49-2.76l1.66-48.73,37.96-19.88Z"
        />
        <path
          fill="#fff"
          fillOpacity="0.95"
          d="M58.15,137.95V66.72s-1.52-13.67,18.5-24.99l54.94-31.61s5.8-3.59,5.8,4.69V47.12s1.52,5.8-8.01,10.49c-9.53,4.69-47.9,27.61-47.9,27.61,0,0-23.33,11.87-23.33,52.74Z"
        />
        <path
          fill="#fff"
          fillOpacity="0.45"
          d="M84.52,91.98s5.52-3.31,13.25-7.87v-8.28c-9.11,5.25-16.43,9.66-16.43,9.66,0,0-20.29,10.35-22.92,45.14v1.1c7.32-30.23,26.09-39.76,26.09-39.76Z"
        />
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 150 150"
      width={size}
      height={size}
      className="shrink-0"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="tyroOrange"
          x1="61.29"
          y1="33.97"
          x2="14.04"
          y2="103.35"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#f07a23" />
          <stop offset="1" stopColor="#b85216" />
        </linearGradient>
        <linearGradient
          id="tyroSolidDeep"
          x1="61.29"
          y1="33.97"
          x2="14.04"
          y2="103.35"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <path
        fill={isSolid ? 'url(#tyroSolidDeep)' : 'url(#tyroOrange)'}
        d="M14.52,68.93v33.41s-.28,6.49,3.59,4.28c10.49-6.21,21.95-12.7,26.51-15.05,9.39-4.69,8.01-10.49,8.01-10.49V48.77c0-8.42-5.8-4.69-5.8-4.69l-28.16,16.15s-4.14,2.35-4.14,8.7Z"
      />
      <path
        fill="#0a3d8f"
        d="M97.77,70.17v40.31s1.52,10.91-7.45,15.88l-25.68,15.19s-6.9,3.31-6.49-2.76l1.66-48.73,37.96-19.88Z"
      />
      <path
        fill="#1d4ed8"
        d="M58.15,137.95V66.72s-1.52-13.67,18.5-24.99l54.94-31.61s5.8-3.59,5.8,4.69V47.12s1.52,5.8-8.01,10.49c-9.53,4.69-47.9,27.61-47.9,27.61,0,0-23.33,11.87-23.33,52.74Z"
      />
      <path
        fill="#062b6e"
        d="M84.52,91.98s5.52-3.31,13.25-7.87v-8.28c-9.11,5.25-16.43,9.66-16.43,9.66,0,0-20.29,10.35-22.92,45.14v1.1c7.32-30.23,26.09-39.76,26.09-39.76Z"
      />
    </svg>
  )
}

export function TyroWordmark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`text-[16px] font-bold lowercase tracking-tight text-foreground ${className}`}
    >
      tyro<span className="bg-gradient-to-r from-[#f07a23] to-[#b85216] bg-clip-text font-bold text-transparent">
        forecast
      </span>
    </span>
  )
}

export function TyroLogo() {
  return (
    <div className="flex items-center gap-2">
      <TyroMark />
      <TyroWordmark />
    </div>
  )
}
