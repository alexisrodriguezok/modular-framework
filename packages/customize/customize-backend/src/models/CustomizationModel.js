const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const colorsSchema = new mongoose.Schema({
    primary: {type: String, required: true},
    onPrimary: {type: String, required: true},
    secondary: {type: String, required: true},
    onSecondary: {type: String, required: true},
})

const logoSchema = new mongoose.Schema({
    mode: {type: String, required: true},
    title: {type: String, required: false},
    filename: {type: String, required: false},
    url: {type: String, required: false}
})


const CustomizationSchema = new Schema({
    colors: colorsSchema,
    logo: logoSchema,
    language: {type: String, required: true}
});


const Customization = mongoose.model('Customization', CustomizationSchema);

module.exports = Customization;
