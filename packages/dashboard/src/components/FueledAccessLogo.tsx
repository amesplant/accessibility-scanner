export function FueledAccessLogo() {
  return (
    <div className="flex items-center gap-3">
      <svg
        width="36"
        height="36"
        viewBox="157 157 710 710"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <radialGradient
            id="fueled-access-bg"
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(330 345) rotate(38) scale(860)"
          >
            <stop offset="0" stopColor="#F38BC3" />
            <stop offset="0.45" stopColor="#B35AEF" />
            <stop offset="0.78" stopColor="#6B67F6" />
            <stop offset="1" stopColor="#8FD4FF" />
          </radialGradient>
        </defs>

        {/* Background circle */}
        <circle cx="512" cy="512" r="355" fill="url(#fueled-access-bg)" />

        {/* Head */}
        <circle cx="545" cy="285" r="50" fill="white" />

        {/* Left arm */}
        <path
          d="M300 352
             C325 338, 355 338, 385 350
             C420 365, 465 370, 510 370
             C522 370, 529 383, 523 394
             C515 409, 499 419, 480 420
             C423 421, 372 410, 327 386
             C302 373, 292 364, 289 358
             C286 352, 292 346, 300 352Z"
          fill="white"
        />

        {/* Right arm */}
        <path
          d="M618 368
             C671 366, 720 357, 771 339
             C790 332, 807 337, 816 348
             C826 361, 824 377, 809 388
             C771 416, 718 430, 653 425
             C639 424, 627 417, 623 408
             C618 398, 621 384, 632 376
             C626 376, 621 373, 618 368Z"
          fill="white"
        />

        {/* Lightning bolt body */}
        <path
          d="M447 365
             H642
             C654 365, 662 378, 655 389
             L572 512
             H674
             C686 512, 692 527, 683 536
             L446 744
             C430 758, 406 741, 415 722
             L478 569
             H410
             C396 569, 388 554, 396 543
             L486 378
             C491 370, 499 365, 508 365
             H447Z"
          fill="white"
        />
      </svg>

      <span className="text-lg font-bold text-white tracking-tight">
        Fueled <span className="text-primary">Access</span>
      </span>
    </div>
  );
}
