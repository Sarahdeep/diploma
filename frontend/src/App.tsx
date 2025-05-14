import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import AdminPage from "./pages/AdminPage.tsx";
import GeoDataMapPage from "./pages/GeoDataMapPage.tsx"; // Import the GeoDataMapPage
import MainLayout from "./components/MainLayout.tsx";
import './App.css'
import './index.css'

function App() {
    return (
        <Router>
            <Routes>
                {/* Parent route using MainLayout */}
                <Route path="/" element={<MainLayout />}>
                    {/* Child routes rendered within MainLayout's Outlet */}
                    <Route path="admin" element={<AdminPage />} />
                    <Route path="geodata-map" element={<GeoDataMapPage />} />
                    {/* Add routes for species and analysis if pages exist */}
                    {/* <Route path="species" element={<SpeciesPage />} /> */}
                    {/* <Route path="analysis" element={<AnalysisPage />} /> */}
                    {/* Optional: Index route for the default view within MainLayout */}
                    {/* <Route index element={<DashboardPage />} /> */}
                </Route>
                {/* Routes outside MainLayout can go here */}
                {/* <Route path="/login" element={<LoginPage />} /> */}
            </Routes>
        </Router>
    );
}

export default App;