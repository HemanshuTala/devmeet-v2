'use client';

export default function AuthLoading() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-full max-w-md mx-auto p-8">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="h-8 w-32 bg-slate-200 rounded animate-pulse" />
          </div>

          {/* Title */}
          <div className="h-6 w-40 mx-auto bg-slate-200 rounded animate-pulse mb-2" />
          <div className="h-4 w-56 mx-auto bg-slate-100 rounded animate-pulse mb-8" />

          {/* Form fields */}
          <div className="space-y-4">
            <div>
              <div className="h-3 w-16 bg-slate-200 rounded animate-pulse mb-2" />
              <div className="h-10 w-full bg-slate-100 border border-slate-200 rounded-lg animate-pulse" />
            </div>
            <div>
              <div className="h-3 w-20 bg-slate-200 rounded animate-pulse mb-2" />
              <div className="h-10 w-full bg-slate-100 border border-slate-200 rounded-lg animate-pulse" />
            </div>
          </div>

          {/* Button */}
          <div className="h-10 w-full bg-indigo-200 rounded-lg animate-pulse mt-6" />

          {/* Divider */}
          <div className="h-px bg-slate-200 my-6" />

          {/* Social buttons */}
          <div className="space-y-3">
            <div className="h-10 w-full bg-slate-100 border border-slate-200 rounded-lg animate-pulse" />
            <div className="h-10 w-full bg-slate-100 border border-slate-200 rounded-lg animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
