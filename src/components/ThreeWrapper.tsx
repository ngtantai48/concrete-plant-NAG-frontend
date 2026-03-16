"use client";

import dynamic from 'next/dynamic';

// Load ThreeBackground chỉ ở phía client (không SSR) để tránh lỗi với Window/ThreeJS
const ThreeBackground = dynamic(() => import('@/components/ThreeBackground'), { ssr: false });

export default function ThreeWrapper() {
    return <ThreeBackground />;
}
