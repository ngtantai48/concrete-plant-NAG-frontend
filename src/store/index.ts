import authReducer from "@/store/slices/authSlice";
import vehicleReducer from "@/store/slices/vehicleSlice";
import driverReducer from "@/store/slices/driverSlice";
import { configureStore } from '@reduxjs/toolkit';

export const store = configureStore({
    reducer: {
        auth: authReducer,
        vehicles: vehicleReducer,
        drivers: driverReducer,
    },
})

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type Store = typeof store;
