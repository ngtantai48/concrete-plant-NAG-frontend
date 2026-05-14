import authReducer from "@/store/slices/authSlice";
import vehicleReducer from "@/store/slices/vehicleSlice";
import driverReducer from "@/store/slices/driverSlice";
import userReducer from "@/store/slices/userSlice";
import { configureStore } from '@reduxjs/toolkit';

export const store = configureStore({
    reducer: {
        auth: authReducer,
        vehicles: vehicleReducer,
        drivers: driverReducer,
        users: userReducer,
    },
})

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type Store = typeof store;
