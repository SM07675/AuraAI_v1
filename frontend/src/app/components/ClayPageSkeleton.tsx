import { motion } from "motion/react";

export function ClayPageSkeleton() {
  return (
    <div className="w-full h-full min-h-[70vh] flex flex-col gap-4 p-4 sm:p-6 max-w-[1200px] mx-auto select-none animate-pulse">
      {/* Top bar skeleton */}
      <div className="flex items-center justify-between gap-4">
        <div className="clay-card-flat h-10 w-48 rounded-full" />
        <div className="clay-card-flat h-10 w-32 rounded-full" />
      </div>

      {/* Main content grid skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.9fr] gap-4 flex-1">
        {/* Left main area */}
        <div className="clay-card p-6 flex flex-col gap-4 rounded-3xl min-h-[340px]">
          <div className="clay-card-flat h-8 w-2/3 rounded-xl" />
          <div className="clay-card-flat h-4 w-1/2 rounded-lg" />
          <div className="flex-1 flex items-center justify-center">
            <div className="w-24 h-24 rounded-full bg-purple-100/50 dark:bg-purple-950/30" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="clay-card-flat h-14 rounded-2xl" />
            <div className="clay-card-flat h-14 rounded-2xl" />
            <div className="clay-card-flat h-14 rounded-2xl" />
          </div>
        </div>

        {/* Right side area */}
        <div className="flex flex-col gap-4">
          <div className="clay-card p-6 rounded-3xl h-44 flex flex-col justify-between">
            <div className="clay-card-flat h-6 w-1/3 rounded-lg" />
            <div className="clay-card-flat h-16 w-full rounded-2xl" />
          </div>
          <div className="clay-card p-6 rounded-3xl flex-1 flex flex-col justify-between">
            <div className="clay-card-flat h-6 w-1/2 rounded-lg" />
            <div className="grid grid-cols-2 gap-3">
              <div className="clay-card-flat h-16 rounded-2xl" />
              <div className="clay-card-flat h-16 rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
