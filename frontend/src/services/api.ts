import axios from "axios";

const API_BASE_URL =  "http://localhost:8000/api/v1";

export const fetchDatasets = () => axios.get(`${API_BASE_URL}/datasets`);
export const deleteDataset = (id: number) => axios.delete(`${API_BASE_URL}/datasets/${id}`);

export const fetchAnimalClasses = () => axios.get(`${API_BASE_URL}/classes`);
export const deleteAnimalClass = (id: number) => axios.delete(`${API_BASE_URL}/classes/${id}`);

export const fetchGeoData = () => axios.get(`${API_BASE_URL}/geodata`);
export const deleteGeoData = (id: number) => axios.delete(`${API_BASE_URL}/geodata/${id}`);