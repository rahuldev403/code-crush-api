let ioInstance;

export const setIO = (io) => {
  ioInstance = io;
};
export const getIO = () => {
  if (!ioInstance) {
    throw new Error("Socket.io not initialized");
  }
  return ioInstance;
};
