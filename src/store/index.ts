import authReducer from "@/store/slices/authSlice";
import vehicleReducer from "@/store/slices/vehicleSlice";
import { configureStore } from '@reduxjs/toolkit';

export const store = configureStore({
    reducer: {
        auth: authReducer,
        vehicles: vehicleReducer,
    },
})

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type Store = typeof store;
