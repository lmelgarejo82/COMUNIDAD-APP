const { Poll } = require('../models/Poll');

exports.create = async (req, res) => {
  try {
    const { title, description, options, expires_at } = req.body;
    if (!title || !options || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: 'title y options (array de al menos 2) son requeridos' });
    }
    const poll = await Poll.create({
      community_id: req.communityId,
      title,
      description,
      options,
      created_by: req.user.id,
      expires_at: expires_at || null,
    });
    res.status(201).json(poll);
  } catch (err) {
    console.error('Error en create poll:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.list = async (req, res) => {
  try {
    const polls = await Poll.findByCommunity(req.communityId);
    const result = await Promise.all(
      polls.map(async (p) => {
        const hasVoted = await Poll.hasVoted(p.id, req.user.id);
        const results = await Poll.getResults(p.id);
        return { ...p, options: typeof p.options === 'string' ? JSON.parse(p.options) : p.options, has_voted: hasVoted, results };
      })
    );
    res.json(result);
  } catch (err) {
    console.error('Error en list polls:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.vote = async (req, res) => {
  try {
    const { id } = req.params;
    const { option_index } = req.body;

    const poll = await Poll.findById(id);
    if (!poll) return res.status(404).json({ error: 'Votación no encontrada' });
    if (poll.expires_at && new Date(poll.expires_at) < new Date()) {
      return res.status(400).json({ error: 'La votación ya expiró' });
    }

    const user = await require('../models/User').User.findById(req.user.id);
    if (user.user_type !== 'owner') {
      return res.status(403).json({ error: 'Solo los propietarios pueden votar' });
    }

    const alreadyVoted = await Poll.hasVoted(id, req.user.id);
    if (alreadyVoted) return res.status(409).json({ error: 'Ya votaste en esta encuesta' });

    const options = typeof poll.options === 'string' ? JSON.parse(poll.options) : poll.options;
    if (option_index < 0 || option_index >= options.length) {
      return res.status(400).json({ error: 'Opción inválida' });
    }

    const vote = await Poll.vote(id, req.user.id, option_index);
    res.status(201).json(vote);
  } catch (err) {
    console.error('Error en vote:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
