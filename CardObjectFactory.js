const gallery = document.getElementById("cardGallery");
const addButton = document.getElementById("addButton");

var count = 0;
addButton.addEventListener("click", () => {
  const newItem = document.createElement("h4");
  newItem.textContent = count;
  count++;

  gallery.append(newItem);
});
