"use client"

import { Toaster as Sonner, type ToasterProps as SonnerProps } from "sonner"

type ToasterProps = SonnerProps & {
  position?: SonnerProps["position"]
}

const Toaster = ({ position = "top-center", ...props }: ToasterProps) => {
  return (
    <Sonner
      richColors={true}
      theme="light"
      className="toaster group"
      position={position}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white group-[.toaster]:text-gray-900 group-[.toaster]:border group-[.toaster]:border-gray-200 group-[.toaster]:shadow-lg group-[.toaster]:rounded-lg",
          description: "group-[.toast]:text-gray-600",
          actionButton:
            "group-[.toast]:bg-blue-600 group-[.toast]:text-white group-[.toast]:hover:bg-blue-700",
          cancelButton:
            "group-[.toast]:bg-gray-100 group-[.toast]:text-gray-700 group-[.toast]:hover:bg-gray-200",
          success:
            "group-[.toaster]:bg-white group-[.toaster]:border-green-200 group-[.toaster]:text-green-800 [&>div]:text-green-600",
          error:
            "group-[.toaster]:bg-white group-[.toaster]:border-red-200 group-[.toaster]:text-red-800 [&>div]:text-red-600",
          warning:
            "group-[.toaster]:bg-white group-[.toaster]:border-yellow-200 group-[.toaster]:text-yellow-800 [&>div]:text-yellow-600",
          info:
            "group-[.toaster]:bg-white group-[.toaster]:border-blue-200 group-[.toaster]:text-blue-800 [&>div]:text-blue-600",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
