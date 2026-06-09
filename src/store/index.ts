import authReducer from "@/store/slices/authSlice";
import userReducer from "@/store/slices/userSlice";
import vehicleMaintenanceReducer from "@/store/slices/vehicleMaintenanceSlice";
import vehicleReducer from "@/store/slices/vehicleSlice";
import { configureStore } from '@reduxjs/toolkit';

export const store = configureStore({
    reducer: {
        auth: authReducer,
        vehicleMaintenances: vehicleMaintenanceReducer,
        vehicles: vehicleReducer,
        users: userReducer,
    },
})

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type Store = typeof store;
