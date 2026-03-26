const gallery = document.getElementById("cardGallery");
const addButton = document.getElementById("addButton");

var count = 1;
const input = document.getElementById("inputItem");
addButton.addEventListener("click", () => {
  const newItem = document.createElement("h4");
  newItem.textContent = count + ". " + input.value;
  count++;
  input.value = "";

  gallery.append(newItem);
});
