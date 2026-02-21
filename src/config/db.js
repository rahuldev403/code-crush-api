import mongoose from "mongoose";

const conncetDb = () => {
  try {
    mongoose.connect(process.env.DB_URL);
    console.log("db connection successfull");
  } catch (error) {
    console.log("error in connecting the db : ", error);
  }
};

export default conncetDb;
