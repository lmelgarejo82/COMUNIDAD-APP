const { Document } = require('../models/Document');

exports.upload = async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: 'title es requerido' });
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

    const file_url = `/uploads/${req.file.filename}`;
    const doc = await Document.create({
      community_id: req.communityId,
      title,
      description: description || null,
      file_url,
      uploaded_by: req.user.id,
    });
    res.status(201).json(doc);
  } catch (err) {
    console.error('Error en upload document:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.list = async (req, res) => {
  try {
    const docs = await Document.findByCommunity(req.communityId);
    res.json(docs);
  } catch (err) {
    console.error('Error en list documents:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
