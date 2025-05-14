import React from "react";

interface TableProps {
    columns: string[];
    data: any[];
}

const Table: React.FC<TableProps> = ({ columns, data }) => {
    return (
        <table style={styles.table}>
            <thead>
                <tr>
                    {columns.map((col) => (
                        <th key={col} style={styles.th}>{col}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {data.map((row, index) => (
                    <tr key={index}>
                        {columns.map((col) => (
                            <td key={col} style={styles.td}>{row[col]}</td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    table: {
        width: "100%",
        borderCollapse: "collapse",
    },
    th: {
        border: "1px solid #ddd",
        padding: "8px",
        backgroundColor: "#007bff",
        color: "white",
        textAlign: "left",
    },
    td: {
        border: "1px solid #ddd",
        padding: "8px",
    },
};

export default Table;