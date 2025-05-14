import React from "react";

const TopBar: React.FC = () => {
    return (
        <div style={styles.container}>
            <div style={styles.logo}>MyApp</div>
            <div style={styles.search}>
                <input type="text" placeholder="Search..." style={styles.searchInput} />
            </div>
            <div style={styles.profile}>
                <img src="./pisdec.jpg" alt="Profile" style={styles.profileImage} />
                <span>Admin</span>
            </div>
        </div>
    );
};

const styles = {
    container: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 20px",
        backgroundColor: "#007bff",
        color: "white",
    },
    logo: {
        fontSize: "20px",
        fontWeight: "bold",
    },
    search: {
        flex: 1,
        marginLeft: "20px",
        marginRight: "20px",
    },
    searchInput: {
        width: "100%",
        padding: "8px",
        borderRadius: "4px",
        border: "1px solid #ccc",
    },
    profile: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
    },
    profileImage: {
        width: "30px",
        height: "30px",
        borderRadius: "50%",
    },
};

export default TopBar;