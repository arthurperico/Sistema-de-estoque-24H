// Função para carregar produtos da API
async function loadProducts() {
    try {
        const response = await fetch('/api/products');
        const products = await response.json();
        displayProducts(products);
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        alert('Erro ao carregar produtos');
    }
}

// Função para exibir produtos na página
function displayProducts(products) {
    const productsList = document.getElementById('productsList');
    productsList.innerHTML = '';

    if (products.length === 0) {
        productsList.innerHTML = '<p>Nenhum produto cadastrado.</p>';
        return;
    }

    products.forEach(product => {
        const productCard = document.createElement('div');
        productCard.className = 'product-card';
        productCard.innerHTML = `
            <div class="product-name">${product.name}</div>
            <div class="product-info">
                <span>Quantidade: ${product.quantity}</span>
                <span>Preço: R$ ${product.price.toFixed(2)}</span>
            </div>
            <div class="product-actions">
                <button class="btn-edit" onclick="editProduct('${product.id}')">Editar</button>
                <button class="btn-delete" onclick="deleteProduct('${product.id}')">Excluir</button>
            </div>
        `;
        productsList.appendChild(productCard);
    });
}

// Função para buscar produtos
async function searchProducts() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    
    if (!searchTerm) {
        loadProducts();
        return;
    }

    try {
        const response = await fetch('/api/products');
        const products = await response.json();
        const filteredProducts = products.filter(product => 
            product.name.toLowerCase().includes(searchTerm)
        );
        displayProducts(filteredProducts);
    } catch (error) {
        console.error('Erro ao buscar produtos:', error);
        alert('Erro ao buscar produtos');
    }
}

// Função para cadastrar produto
document.getElementById('productForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const product = {
        name: formData.get('name'),
        quantity: parseInt(formData.get('quantity')),
        price: parseFloat(formData.get('price'))
    };

    try {
        const response = await fetch('/api/products', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(product)
        });

        if (response.ok) {
            alert('Produto cadastrado com sucesso!');
            e.target.reset();
            loadProducts();
        } else {
            alert('Erro ao cadastrar produto');
        }
    } catch (error) {
        console.error('Erro ao cadastrar produto:', error);
        alert('Erro ao cadastrar produto');
    }
});

// Função para editar produto
async function editProduct(id) {
    try {
        const response = await fetch(`/api/products/${id}`);
        const product = await response.json();
        
        const newQuantity = prompt('Nova quantidade:', product.quantity);
        const newPrice = prompt('Novo preço:', product.price);
        
        if (newQuantity !== null && newPrice !== null) {
            const updatedProduct = {
                quantity: parseInt(newQuantity),
                price: parseFloat(newPrice)
            };

            const updateResponse = await fetch(`/api/products/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updatedProduct)
            });

            if (updateResponse.ok) {
                alert('Produto atualizado com sucesso!');
                loadProducts();
            } else {
                alert('Erro ao atualizar produto');
            }
        }
    } catch (error) {
        console.error('Erro ao editar produto:', error);
        alert('Erro ao editar produto');
    }
}

// Função para excluir produto
async function deleteProduct(id) {
    if (confirm('Tem certeza que deseja excluir este produto?')) {
        try {
            const response = await fetch(`/api/products/${id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                alert('Produto excluído com sucesso!');
                loadProducts();
            } else {
                alert('Erro ao excluir produto');
            }
        } catch (error) {
            console.error('Erro ao excluir produto:', error);
            alert('Erro ao excluir produto');
        }
    }
}

// Carregar produtos ao iniciar
document.addEventListener('DOMContentLoaded', loadProducts);