import React, { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";

// Define the type for the allowed sections
type Section = 'upload' | 'observations' | 'analysis' | 'map';

const MainLayout: React.FC = () => {
    const navigate = useNavigate();
    // Initialize state with a default value, e.g., 'upload'
    const [activeSection, setActiveSection] = useState<Section>('upload');

    // Map section keys to routes
    const sectionRoutes: Record<Section, string> = {
        upload: "/admin", // Assuming /admin corresponds to 'upload'
        observations: "/observations", // New route for observations
        analysis: "/analysis", // Define route for 'analysis'
        map: "/geodata-map", // Assuming /geodata-map corresponds to 'map'
    };

    const handleSelect = (section: Section) => {
        setActiveSection(section);
        // Navigate to the corresponding route
        navigate(sectionRoutes[section]);
    };

    return (
        <div className="flex h-screen">
            {/* Sidebar component */}
            <Sidebar active={activeSection} onSelect={handleSelect} />
            <main className="flex-1 p-4 overflow-auto">
                <Outlet />
            </main>
        </div>
    );
};

export default MainLayout;